/**
 * VirtuDrive AI — Physics Engine
 *
 * Deterministic vehicle dynamics equations. All units SI unless noted.
 * References: Gillespie "Fundamentals of Vehicle Dynamics" (1992),
 * Milliken & Milliken "Race Car Vehicle Dynamics" (1995).
 */

export const G = 9.80665; // m/s^2
export const AIR_DENSITY = 1.225; // kg/m^3 at sea level, 15°C

export interface VehicleSpec {
  mass_kg: number;
  wheelbase_m: number;
  track_m: number;
  cog_height_m: number;
  frontal_area_m2: number;
  drag_coeff: number;
  rolling_resist_coeff: number;
  tire_friction_mu: number;
  max_power_kw: number;
  max_torque_nm: number;
  engine_efficiency: number;
  fuel_energy_mj_per_l: number;
  fuel_type: string;
}

/** Static Stability Factor: t / (2h). Higher = harder to roll. */
export const staticStabilityFactor = (v: VehicleSpec) => v.track_m / (2 * v.cog_height_m);

/**
 * Safe cornering speed on a banked corner.
 * v = sqrt( g·r · (sin θ + μ cos θ) / (cos θ − μ sin θ) )
 */
export function corneringLimitSpeed(radius_m: number, mu: number, bank_deg = 0): number {
  const theta = (bank_deg * Math.PI) / 180;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const denom = c - mu * s;
  if (denom <= 0) return Infinity;
  const num = s + mu * c;
  return Math.sqrt(G * radius_m * (num / denom));
}

/** Rollover threshold speed on flat road: v = sqrt(g·r · t/(2h)). */
export function rolloverLimitSpeed(radius_m: number, v: VehicleSpec): number {
  return Math.sqrt(G * radius_m * staticStabilityFactor(v));
}

/** Whichever limit is lower governs; also returns which one. */
export function safeCornerSpeed(
  radius_m: number,
  v: VehicleSpec,
  surface_mu: number,
  bank_deg = 0,
) {
  const mu = Math.min(v.tire_friction_mu, surface_mu);
  const skid = corneringLimitSpeed(radius_m, mu, bank_deg);
  const roll = rolloverLimitSpeed(radius_m, v);
  const limit = Math.min(skid, roll);
  return {
    skid_mps: skid,
    roll_mps: roll,
    limit_mps: limit,
    limiting: (roll < skid ? "rollover" : "skid") as "rollover" | "skid",
    mu_used: mu,
  };
}

/** Aerodynamic drag force (N) */
export const aeroDrag = (v: VehicleSpec, speed_mps: number) =>
  0.5 * AIR_DENSITY * v.drag_coeff * v.frontal_area_m2 * speed_mps * speed_mps;

/** Rolling resistance (N) */
export const rollingResistance = (v: VehicleSpec, slope_rad = 0) =>
  v.rolling_resist_coeff * v.mass_kg * G * Math.cos(slope_rad);

/** Grade resistance (N) — positive up, negative down */
export const gradeResistance = (v: VehicleSpec, slope_rad: number) =>
  v.mass_kg * G * Math.sin(slope_rad);

/** Total resistive force at speed on a slope */
export const totalResistance = (v: VehicleSpec, speed_mps: number, slope_rad = 0) =>
  aeroDrag(v, speed_mps) + rollingResistance(v, slope_rad) + gradeResistance(v, slope_rad);

/** Max drive force available at a given speed (limited by power at high v) */
export function maxDriveForce(v: VehicleSpec, speed_mps: number): number {
  const powerLimitedN = speed_mps > 0.5 ? (v.max_power_kw * 1000) / speed_mps : Infinity;
  // Torque-limited approximation: assume final drive gives F ~ torque / wheel_radius.
  // Use wheelbase/6 as effective wheel radius proxy (~0.3m for 1.8m WB); good order-of-magnitude.
  const wheelR = Math.max(0.25, v.wheelbase_m / 6);
  const torqueLimitedN = (v.max_torque_nm * 4) / wheelR; // gearbox × final drive lump
  // Traction limit
  const tractionN = v.tire_friction_mu * v.mass_kg * G;
  return Math.min(powerLimitedN, torqueLimitedN, tractionN);
}

/** Steady-state top speed on flat ground (drive = resistance) */
export function topSpeedFlat(v: VehicleSpec): number {
  return topSpeedOnSlope(v, 0);
}

/**
 * Steady-state top speed on an arbitrary slope (rad).
 * Returns 0 if the vehicle cannot overcome resistance even at creep speed
 * (i.e. the slope is un-climbable for this vehicle).
 */
export function topSpeedOnSlope(v: VehicleSpec, slope_rad: number): number {
  const creep = 0.5;
  if (maxDriveForce(v, creep) - totalResistance(v, creep, slope_rad) <= 0) return 0;
  let lo = creep,
    hi = 400;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const balance = maxDriveForce(v, mid) - totalResistance(v, mid, slope_rad);
    if (balance > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Maximum climbable slope at very low speed (grip, torque, and rolling limited). */
export function maxSlopeRad(v: VehicleSpec): number {
  // Bisection: find largest slope where the vehicle can still move at creep speed.
  let lo = 0,
    hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const drive = maxDriveForce(v, 0.5);
    const resist = totalResistance(v, 0.5, mid);
    if (drive - resist > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Braking distance from v0 to 0 with friction mu (m) */
export const brakingDistance = (v0_mps: number, mu: number) => (v0_mps * v0_mps) / (2 * mu * G);

/** Stopping distance = reaction + braking (m) */
export const stoppingDistance = (v0_mps: number, mu: number, reaction_s = 1.0) =>
  v0_mps * reaction_s + brakingDistance(v0_mps, mu);

/**
 * Fuel consumption rate in L/s.
 *
 * Two-term model (Gillespie §5, Guzzella & Sciarretta §2):
 *   - Brake-power term: P_mech = max(0, F_resist · v) → fuel = P_mech / (η · LHV)
 *   - Idle term: measured idle fuel flow (L/h) by fuel type — NOT divided by η,
 *     because idle is already whole-engine consumption; dividing again double-
 *     counts engine losses. Previous 3 kW idle divided by η ≈ 30 % gave ~10 kW
 *     of "idle" fuel — the dominant source of the 26–30 L/100 km overshoot.
 *
 * On downhill / coast-down, mech term collapses to 0 (models modern DFCO).
 * EVs return 0 idle.
 */
export function fuelRateLps(v: VehicleSpec, speed_mps: number, slope_rad = 0): number {
  const F = totalResistance(v, speed_mps, slope_rad);
  const mechW = Math.max(0, F * Math.max(0, speed_mps));
  const eta = Math.max(0.1, v.engine_efficiency);
  const energyPerL_J = Math.max(1e6, v.fuel_energy_mj_per_l * 1e6);
  const mechLps = mechW / eta / energyPerL_J;

  // Idle fuel flow (L/h) — warm engine, base accessories:
  //   gasoline NA ≈ 0.7, diesel ≈ 0.4, hybrid ≈ 0.12 (engine-off idle),
  //   CNG ≈ 0.7, EV = 0.
  const idleLph =
    v.fuel_type === "electric"
      ? 0
      : v.fuel_type === "hybrid"
        ? 0.12
        : v.fuel_type === "diesel"
          ? 0.4
          : 0.7;
  const idleLps = idleLph / 3600;
  return mechLps + idleLps;
}

/** Fuel consumption in L/100km at steady cruise */
export function fuelPer100km(v: VehicleSpec, speed_mps: number, slope_rad = 0): number {
  if (speed_mps < 0.1) return 0;
  const lps = fuelRateLps(v, speed_mps, slope_rad);
  return (lps / speed_mps) * 100_000;
}

/** Lateral acceleration in g for a curve at speed */
export const lateralG = (speed_mps: number, radius_m: number) =>
  (speed_mps * speed_mps) / (radius_m * G);

/** Steering angle (deg) using Ackermann geometry */
export const ackermannSteeringDeg = (wheelbase_m: number, radius_m: number) =>
  (Math.atan(wheelbase_m / radius_m) * 180) / Math.PI;

/** Legacy composite safety score — kept for external callers. */
export function safetyScore(
  latG: number,
  latLimitG: number,
  slopeRad: number,
  maxSlope: number,
): number {
  const latUsage = latLimitG > 0 ? latG / latLimitG : 0;
  const slopeUsage = maxSlope > 0 ? Math.abs(slopeRad) / maxSlope : 0;
  const worst = Math.max(latUsage, slopeUsage);
  return Math.max(0, Math.min(100, (1 - worst) * 100));
}

/**
 * Adaptive-controller safety score: 100 while the vehicle stays at or below
 * the computed safe cap, degrading linearly to 0 at 20 % overshoot.
 */
export function safetyScoreVsSafe(v_mps: number, safe_mps: number): number {
  if (safe_mps <= 0) return 100;
  const over = Math.max(0, v_mps - safe_mps) / safe_mps;
  return Math.max(0, Math.min(100, (1 - over * 5) * 100));
}

export const mpsToKmh = (v: number) => v * 3.6;
export const kmhToMps = (v: number) => v / 3.6;
export const degToRad = (d: number) => (d * Math.PI) / 180;
export const radToDeg = (r: number) => (r * 180) / Math.PI;
