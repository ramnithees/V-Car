/**
 * VirtuDrive AI — road-following simulation with adaptive safe-speed control.
 *
 * The controller never exceeds the driver Target Speed but also clamps every
 * station to the minimum of {cornering skid, rollover, brake reserve, engine
 * top-on-slope, top-flat}. The dominant constraint is exposed per-sample as
 * `limiting_factor` so telemetry, HUD and PDF can label what is binding.
 */
import {
  G,
  ackermannSteeringDeg,
  degToRad,
  fuelRateLps,
  lateralG,
  maxDriveForce,
  maxSlopeRad,
  radToDeg,
  safeCornerSpeed,
  safetyScoreVsSafe,
  topSpeedFlat,
  topSpeedOnSlope,
  totalResistance,
  type VehicleSpec,
} from "./index";

export type CurveType = "left" | "right" | "hairpin_left" | "hairpin_right" | "s_curve" | "banked";

export type LimitFactor = "target" | "skid" | "rollover" | "brake" | "grade" | "top" | "grip";

export const LIMIT_LABEL: Record<LimitFactor, string> = {
  target: "Driver target",
  skid: "Curve grip (skid)",
  rollover: "Rollover threshold",
  brake: "Brake reserve",
  grade: "Uphill power",
  top: "Top speed",
  grip: "Tire grip cap",
};

export interface Curve {
  station: number;
  radius: number;
  angle_deg: number;
  length_m?: number;
  bank_deg?: number;
  type?: CurveType;
}

export interface SlopeSpec {
  direction: "uphill" | "downhill";
  angle_deg: number;
  length_m: number;
  transition_m: number;
  bank_deg: number;
  bank_dir: "left" | "right" | "flat";
}

export interface RoadSpec {
  length_m: number;
  surface_mu: number;
  base_slope_deg: number;
  curves: Curve[];
  slopes?: SlopeSpec[];
}

export interface SimParams {
  driver_target_kmh?: number;
  reaction_time_s?: number;
  step_m?: number;
}

export interface SimSample {
  idx: number;
  s_m: number;
  t_s: number;
  x: number;
  y: number;
  z: number;
  heading_rad: number;
  speed_mps: number;
  lat_accel: number;
  long_accel: number;
  steering_deg: number;
  fuel_rate_lps: number;
  safety_score: number;
  radius_m: number | null;
  slope_rad: number;
  bank_rad: number;
  /** Adaptive safe speed cap at this station (m/s). */
  safe_speed_mps: number;
  /** Currently-binding physical constraint. */
  limiting_factor: LimitFactor;
}

export interface SafePoint {
  s_m: number;
  safe_mps: number;
  limiting: LimitFactor;
  radius_m: number | null;
  bank_rad: number;
  slope_rad: number;
}

export interface SafeSegmentRow {
  kind: "straight" | "curve" | "slope";
  label: string;
  start_m: number;
  end_m: number;
  radius_m: number | null;
  bank_deg: number;
  grade_deg: number;
  surface_mu: number;
  safe_kmh: number;
  actual_peak_kmh: number;
  limiting: LimitFactor;
  equation: string;
  margin_pct: number;
}

export interface SimResults {
  samples: SimSample[];
  summary: {
    top_speed_kmh: number;
    avg_speed_kmh: number;
    min_speed_kmh: number;
    max_lat_g: number;
    max_long_g: number;
    max_slope_deg: number;
    total_time_s: number;
    total_distance_m: number;
    total_fuel_l: number;
    fuel_per_100km: number;
    min_safety_score: number;
    avg_safety_score: number;
    theoretical_top_speed_kmh: number;
    max_climbable_slope_deg: number;
    limiting_events: LimitingEvent[];
    /** Fraction of stations where controller held vehicle exactly at safe cap. */
    at_limit_fraction: number;
  };
}

export interface LimitingEvent {
  station: number;
  radius: number;
  limit_kmh: number;
  limiting: "skid" | "rollover";
  lat_g_at_limit: number;
  steering_deg: number;
  bank_deg: number;
}

/** 5 % cornering-cap margin ensures latG stays below physical limit. */
const CORNER_MARGIN = 0.95;

/* ─────────────────────────  Road geometry sampling  ────────────────────── */

function curveArcLen(c: Curve): number {
  const derived = (c.radius * c.angle_deg * Math.PI) / 180;
  const l = c.length_m && c.length_m > 0 ? c.length_m : derived;
  return Math.min(l, 2 * Math.PI * c.radius);
}

function curveDirection(t: CurveType | undefined): 1 | -1 {
  switch (t) {
    case "left":
    case "hairpin_left":
      return 1;
    case "right":
    case "hairpin_right":
    case "banked":
    default:
      return -1;
    case "s_curve":
      return 1;
  }
}

function bankDirSign(d: SlopeSpec["bank_dir"]): number {
  return d === "left" ? 1 : d === "right" ? -1 : 0;
}

function buildSlopeRanges(slopes: SlopeSpec[] | undefined) {
  const ranges: Array<{
    start: number;
    end: number;
    transEnd: number;
    grade_rad: number;
    bank_rad: number;
  }> = [];
  if (!slopes) return ranges;
  let cursor = 0;
  for (const sl of slopes) {
    const gradeSign = sl.direction === "uphill" ? 1 : -1;
    const grade_rad = degToRad(sl.angle_deg) * gradeSign;
    const bank_rad = degToRad(sl.bank_deg) * bankDirSign(sl.bank_dir);
    const start = cursor;
    const end = cursor + sl.length_m;
    ranges.push({ start, end, transEnd: end + sl.transition_m, grade_rad, bank_rad });
    cursor = end + sl.transition_m;
  }
  return ranges;
}

function roadAt(
  s: number,
  curves: Curve[],
  slopeRanges: ReturnType<typeof buildSlopeRanges>,
  baseSlopeRad: number,
) {
  let kappa = 0;
  let radius: number | null = null;
  let curveBank_rad = 0;
  for (const c of curves) {
    const arcLen = curveArcLen(c);
    if (s >= c.station && s <= c.station + arcLen) {
      radius = c.radius;
      let sign = curveDirection(c.type);
      if (c.type === "s_curve") {
        const rel = (s - c.station) / arcLen;
        sign = rel < 0.5 ? 1 : -1;
      }
      kappa = (1 / c.radius) * sign;
      curveBank_rad = degToRad(c.bank_deg ?? 0) * sign;
      break;
    }
  }
  let slope_rad = baseSlopeRad;
  let slopeBank_rad = 0;
  for (const r of slopeRanges) {
    if (s >= r.start && s <= r.end) {
      slope_rad = r.grade_rad;
      slopeBank_rad = r.bank_rad;
      break;
    }
    if (r.transEnd > r.end && s > r.end && s <= r.transEnd) {
      const t = (s - r.end) / (r.transEnd - r.end);
      slope_rad = r.grade_rad * (1 - t) + baseSlopeRad * t;
      slopeBank_rad = r.bank_rad * (1 - t);
      break;
    }
  }
  const bank_rad = curveBank_rad !== 0 ? curveBank_rad : slopeBank_rad;
  return { kappa, radius, bank_rad, slope_rad };
}

function integrateGeometry(
  road: RoadSpec,
  step: number,
  slopeRanges: ReturnType<typeof buildSlopeRanges>,
  baseSlopeRad: number,
) {
  const pts: { x: number; y: number; z: number; heading: number }[] = [];
  let x = 0,
    y = 0,
    z = 0,
    heading = 0;
  const n = Math.ceil(road.length_m / step) + 1;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    pts.push({ x, y, z, heading });
    const { kappa, slope_rad } = roadAt(s, road.curves, slopeRanges, baseSlopeRad);
    const hStep = step * Math.cos(slope_rad);
    heading += kappa * hStep;
    x += Math.cos(heading) * hStep;
    y += Math.sin(heading) * hStep;
    z += step * Math.sin(slope_rad);
  }
  return pts;
}

/* ───────────────────────  Adaptive safe-speed profile  ────────────────── */

/**
 * Compute station-by-station safe speed profile with the dominant limiting
 * factor. Applies:
 *   - target speed cap (driver upper bound)
 *   - flat-ground top speed & per-slope top speed
 *   - cornering: skid OR rollover (whichever is lower)
 *   - global tire grip limit
 * Then a backward pass folds in brake capacity so the vehicle can shed speed
 * before each downstream cap without exceeding μ·g deceleration.
 */
export function computeSafeProfile(
  vehicle: VehicleSpec,
  road: RoadSpec,
  targetKmh: number | undefined,
  stepM = 5,
): SafePoint[] {
  const step = stepM;
  const targetMps = targetKmh && targetKmh > 0 ? targetKmh / 3.6 : Infinity;
  const baseSlopeRad = degToRad(road.base_slope_deg);
  const slopeRanges = buildSlopeRanges(road.slopes);
  const n = Math.ceil(road.length_m / step) + 1;

  const topFlat = topSpeedFlat(vehicle);
  const gripCapMps = Math.sqrt(vehicle.tire_friction_mu * G * 300); // grip-limited cruise ceiling on r=300m

  const pts: SafePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * step;
    const at = roadAt(s, road.curves, slopeRanges, baseSlopeRad);

    // Candidate speeds and their labels.
    const cands: Array<{ v: number; f: LimitFactor }> = [
      { v: targetMps, f: "target" },
      { v: topFlat, f: "top" },
      { v: gripCapMps, f: "grip" },
    ];
    if (at.slope_rad > 0.005) {
      cands.push({ v: topSpeedOnSlope(vehicle, at.slope_rad), f: "grade" });
    }
    if (at.radius != null) {
      const r = safeCornerSpeed(
        at.radius,
        vehicle,
        road.surface_mu,
        Math.abs(radToDeg(at.bank_rad)),
      );
      cands.push({
        v: r.limit_mps * CORNER_MARGIN,
        f: r.limiting === "rollover" ? "rollover" : "skid",
      });
    }
    // Pick minimum finite candidate.
    let best = cands[0];
    for (const c of cands) if (c.v < best.v) best = c;
    pts[i] = {
      s_m: s,
      safe_mps: Math.max(1, best.v),
      limiting: best.f,
      radius_m: at.radius,
      bank_rad: at.bank_rad,
      slope_rad: at.slope_rad,
    };
  }

  // Backward pass: brake capacity.
  const muBrake = Math.min(vehicle.tire_friction_mu, road.surface_mu);
  const brakeDecel = muBrake * G;
  for (let i = n - 2; i >= 0; i--) {
    const vNext2 = pts[i + 1].safe_mps ** 2;
    const brakeCap = Math.sqrt(vNext2 + 2 * brakeDecel * step);
    if (brakeCap < pts[i].safe_mps) {
      pts[i].safe_mps = Math.max(1, brakeCap);
      pts[i].limiting = "brake";
    }
  }
  return pts;
}

/* ────────────────────────────  Main simulation  ────────────────────────── */

export function runSimulation(
  vehicle: VehicleSpec,
  road: RoadSpec,
  params: SimParams = {},
): SimResults {
  const step = params.step_m ?? 5;
  const baseSlopeRad = degToRad(road.base_slope_deg);
  const slopeRanges = buildSlopeRanges(road.slopes);

  const geom = integrateGeometry(road, step, slopeRanges, baseSlopeRad);
  const n = geom.length;

  let peakSlope = baseSlopeRad;
  for (const r of slopeRanges) if (r.grade_rad > peakSlope) peakSlope = r.grade_rad;

  const topFlat = topSpeedFlat(vehicle);
  const topOnPeak = topSpeedOnSlope(vehicle, peakSlope);
  if (peakSlope > 0 && topOnPeak <= 0.5) {
    throw new Error(
      `Peak uphill slope of ${radToDeg(peakSlope).toFixed(1)}° exceeds vehicle capability. ` +
        `Maximum climbable slope for this vehicle is ${radToDeg(maxSlopeRad(vehicle)).toFixed(1)}°. ` +
        `Reduce the road's slope or choose a vehicle with more torque / grip.`,
    );
  }

  const profile = computeSafeProfile(vehicle, road, params.driver_target_kmh, step);
  const events: LimitingEvent[] = [];
  const seenCurves = new Set<number>();
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    if (p.radius_m != null && (p.limiting === "skid" || p.limiting === "rollover")) {
      const key = Math.round(p.radius_m * 1000) + Math.round(p.s_m);
      if (!seenCurves.has(key)) {
        seenCurves.add(key);
        events.push({
          station: p.s_m,
          radius: p.radius_m,
          limit_kmh: (p.safe_mps / CORNER_MARGIN) * 3.6,
          limiting: p.limiting === "rollover" ? "rollover" : "skid",
          lat_g_at_limit: lateralG(p.safe_mps, p.radius_m),
          steering_deg: ackermannSteeringDeg(vehicle.wheelbase_m, p.radius_m),
          bank_deg: radToDeg(p.bank_rad),
        });
      }
    }
  }

  // Forward pass: engine acceleration + adaptive cap.
  const samples: SimSample[] = [];
  let v = 0;
  let t = 0;
  let fuelL = 0;
  let maxLatG = 0;
  let maxLongG = 0;
  let atLimitCount = 0;

  for (let i = 0; i < n; i++) {
    const p = profile[i];
    if (i > 0) {
      const netF = maxDriveForce(vehicle, v) - totalResistance(vehicle, v, p.slope_rad);
      const dv2 = v * v + 2 * (netF / vehicle.mass_kg) * step;
      const vAccel = Math.sqrt(Math.max(0, dv2));
      v = Math.min(vAccel, p.safe_mps);
    } else {
      v = Math.min(1, p.safe_mps);
    }
    v = Math.max(1.0, v);

    // Was the controller holding vehicle at the cap this frame?
    const atCap = Math.abs(v - p.safe_mps) / Math.max(1, p.safe_mps) < 0.02;
    if (atCap) atLimitCount++;

    const g = geom[i];
    const latA = p.radius_m ? (v * v) / p.radius_m : 0;
    const vPrev = i > 0 ? samples[i - 1].speed_mps : v;
    const vAvg = Math.max(1.0, (v + vPrev) / 2);
    const dt = step / vAvg;
    const longA = i > 0 ? (v - vPrev) / Math.max(0.01, dt) : 0;
    // Evaluate fuel at the mean speed of the step (trapezoidal), then
    // integrate over dt derived from that same mean speed. Avoids the
    // creep-speed blow-up where dt = step/v inflates as v → 1.
    const fuelRate = fuelRateLps(vehicle, vAvg, p.slope_rad);
    fuelL += fuelRate * dt;
    t += dt;

    const latG = latA / G;
    const longG = longA / G;
    if (latG > maxLatG) maxLatG = latG;
    if (Math.abs(longG) > maxLongG) maxLongG = Math.abs(longG);
    const score = safetyScoreVsSafe(v, p.safe_mps);

    const steerMag = p.radius_m ? ackermannSteeringDeg(vehicle.wheelbase_m, p.radius_m) : 0;
    const steer =
      steerMag *
      Math.sign(p.radius_m ? g.heading - (samples[i - 1]?.heading_rad ?? g.heading) || 1 : 0);

    samples.push({
      idx: i,
      s_m: p.s_m,
      t_s: t,
      x: g.x,
      y: g.y,
      z: g.z,
      heading_rad: g.heading,
      speed_mps: v,
      lat_accel: latA,
      long_accel: longA,
      steering_deg: Math.abs(steer),
      fuel_rate_lps: fuelRate,
      safety_score: score,
      radius_m: p.radius_m,
      slope_rad: p.slope_rad,
      bank_rad: p.bank_rad,
      safe_speed_mps: p.safe_mps,
      limiting_factor: p.limiting,
    });
  }

  const speeds = samples.map((s) => s.speed_mps);
  const scores = samples.map((s) => s.safety_score);
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  return {
    samples,
    summary: {
      top_speed_kmh: Math.max(...speeds) * 3.6,
      avg_speed_kmh: avgSpeed * 3.6,
      min_speed_kmh: Math.min(...speeds) * 3.6,
      max_lat_g: maxLatG,
      max_long_g: maxLongG,
      max_slope_deg: radToDeg(peakSlope),
      total_time_s: t,
      total_distance_m: road.length_m,
      total_fuel_l: fuelL,
      fuel_per_100km: (fuelL / road.length_m) * 100_000,
      min_safety_score: Math.min(...scores),
      avg_safety_score: scores.reduce((a, b) => a + b, 0) / scores.length,
      theoretical_top_speed_kmh: topFlat * 3.6,
      max_climbable_slope_deg: radToDeg(maxSlopeRad(vehicle)),
      limiting_events: events.sort((a, b) => a.station - b.station),
      at_limit_fraction: atLimitCount / n,
    },
  };
}

/* ────────────────────────  Per-segment safe-speed table  ───────────────── */

/**
 * Group road into human-readable segments (straights, curves, slope regions)
 * and, for each, report the calculated safe speed, the actual peak the vehicle
 * hit, and the dominant equation. Powers the PDF "Safe Speed Analysis" table.
 */
export function buildSafeSegmentTable(
  vehicle: VehicleSpec,
  road: RoadSpec,
  samples: SimSample[],
  targetKmh: number | undefined,
): SafeSegmentRow[] {
  const rows: SafeSegmentRow[] = [];
  const step = samples.length > 1 ? samples[1].s_m - samples[0].s_m : 5;
  const profile = computeSafeProfile(vehicle, road, targetKmh, step);

  const peakBetween = (a: number, b: number) => {
    let peak = 0,
      safeMin = Infinity,
      dom: LimitFactor = "target";
    for (const p of profile) {
      if (p.s_m < a || p.s_m > b) continue;
      if (p.safe_mps < safeMin) {
        safeMin = p.safe_mps;
        dom = p.limiting;
      }
    }
    for (const s of samples) {
      if (s.s_m < a || s.s_m > b) continue;
      if (s.speed_mps > peak) peak = s.speed_mps;
    }
    return { peak_mps: peak, safe_mps: safeMin === Infinity ? 0 : safeMin, dom };
  };

  const eq = (f: LimitFactor) => {
    switch (f) {
      case "skid":
        return "v = √(g·r·(sinθ+μcosθ)/(cosθ−μsinθ))";
      case "rollover":
        return "v = √(g·r·t/(2h))";
      case "brake":
        return "v² = v_next² + 2·μ·g·Δs";
      case "grade":
        return "F_drive(v) = F_resist(v,θ_grade)";
      case "top":
        return "F_drive(v) = F_drag(v) + F_roll";
      case "grip":
        return "a_lat ≤ μ·g";
      case "target":
        return "v ≤ v_target";
    }
  };

  // Curves first.
  const sorted = [...road.curves].sort((a, b) => a.station - b.station);
  const boundaries: Array<{
    a: number;
    b: number;
    kind: "curve" | "straight";
    c?: Curve;
    idx: number;
  }> = [];
  let cursor = 0,
    straightIdx = 1,
    curveIdx = 1;
  for (const c of sorted) {
    if (c.station > cursor) {
      boundaries.push({ a: cursor, b: c.station, kind: "straight", idx: straightIdx++ });
    }
    const arc = curveArcLen(c);
    boundaries.push({ a: c.station, b: c.station + arc, kind: "curve", c, idx: curveIdx++ });
    cursor = c.station + arc;
  }
  if (cursor < road.length_m)
    boundaries.push({ a: cursor, b: road.length_m, kind: "straight", idx: straightIdx++ });

  for (const b of boundaries) {
    const info = peakBetween(b.a, b.b);
    const margin =
      info.safe_mps > 0 ? Math.max(0, ((info.safe_mps - info.peak_mps) / info.safe_mps) * 100) : 0;
    if (b.kind === "curve" && b.c) {
      const typeLabel = b.c.type ?? "right";
      rows.push({
        kind: "curve",
        label: `Curve ${b.idx} (${typeLabel.replace("_", " ")})`,
        start_m: b.a,
        end_m: b.b,
        radius_m: b.c.radius,
        bank_deg: b.c.bank_deg ?? 0,
        grade_deg: road.base_slope_deg,
        surface_mu: road.surface_mu,
        safe_kmh: info.safe_mps * 3.6,
        actual_peak_kmh: info.peak_mps * 3.6,
        limiting: info.dom,
        equation: eq(info.dom),
        margin_pct: margin,
      });
    } else {
      rows.push({
        kind: "straight",
        label: `Straight ${b.idx}`,
        start_m: b.a,
        end_m: b.b,
        radius_m: null,
        bank_deg: 0,
        grade_deg: road.base_slope_deg,
        surface_mu: road.surface_mu,
        safe_kmh: info.safe_mps * 3.6,
        actual_peak_kmh: info.peak_mps * 3.6,
        limiting: info.dom,
        equation: eq(info.dom),
        margin_pct: margin,
      });
    }
  }

  // Slope segments layered on top.
  if (road.slopes && road.slopes.length) {
    let sc = 0,
      si = 1;
    for (const sl of road.slopes) {
      const a = sc,
        b = sc + sl.length_m;
      const info = peakBetween(a, b);
      const margin =
        info.safe_mps > 0
          ? Math.max(0, ((info.safe_mps - info.peak_mps) / info.safe_mps) * 100)
          : 0;
      rows.push({
        kind: "slope",
        label: `${sl.direction === "uphill" ? "Uphill" : "Downhill"} ${si++} (${sl.angle_deg}°)`,
        start_m: a,
        end_m: b,
        radius_m: null,
        bank_deg: sl.bank_deg * (sl.bank_dir === "left" ? 1 : sl.bank_dir === "right" ? -1 : 0),
        grade_deg: sl.angle_deg * (sl.direction === "uphill" ? 1 : -1),
        surface_mu: road.surface_mu,
        safe_kmh: info.safe_mps * 3.6,
        actual_peak_kmh: info.peak_mps * 3.6,
        limiting: info.dom,
        equation: eq(info.dom),
        margin_pct: margin,
      });
      sc = b + sl.transition_m;
    }
  }
  return rows.sort((a, b) => a.start_m - b.start_m);
}
