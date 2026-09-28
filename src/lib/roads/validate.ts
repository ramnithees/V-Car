export interface CurveDraft {
  station: number;
  radius: number;
  length_m: number;
  angle_deg: number;
  bank_deg: number;
  type: "left" | "right" | "hairpin_left" | "hairpin_right" | "s_curve" | "banked";
}

export interface SlopeDraft {
  direction: "uphill" | "downhill";
  angle_deg: number;
  length_m: number;
  transition_m: number;
  bank_deg: number;
  bank_dir: "left" | "right" | "flat";
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Physically meaningful geometry envelope, enforced here and by DB constraints. */
export const ROAD_LIMITS = {
  base_slope_deg: { min: -20, max: 20 },
  slope_angle_deg: { min: 0, max: 20 },
  bank_deg: { min: -15, max: 15 },
} as const;

export function validateRoad(input: {
  name: string;
  length_m: number;
  base_slope_deg?: number;
  curves: CurveDraft[];
  slopes: SlopeDraft[];
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.name.trim()) errors.push("Road name is required.");
  if (input.length_m < 500) errors.push("Road length must be at least 500 m.");
  if (input.length_m > 100_000) errors.push("Road length must be at most 100 km.");

  const base = input.base_slope_deg;
  if (base !== undefined) {
    if (!Number.isFinite(base)) errors.push("Base slope must be a number.");
    else if (base < ROAD_LIMITS.base_slope_deg.min || base > ROAD_LIMITS.base_slope_deg.max)
      errors.push(
        `Base slope must be between ${ROAD_LIMITS.base_slope_deg.min}° and ${ROAD_LIMITS.base_slope_deg.max}° (got ${base}°).`,
      );
  }

  // Slopes
  for (const [i, s] of input.slopes.entries()) {
    if (s.angle_deg < 0 || s.angle_deg > 20)
      errors.push(`Slope #${i + 1}: angle must be between 0° and 20° (got ${s.angle_deg}°).`);
    if (s.length_m <= 0) errors.push(`Slope #${i + 1}: length must be positive.`);
    if (s.transition_m < 0) errors.push(`Slope #${i + 1}: transition length cannot be negative.`);
    if (s.bank_deg < ROAD_LIMITS.bank_deg.min || s.bank_deg > ROAD_LIMITS.bank_deg.max)
      errors.push(
        `Slope #${i + 1}: bank must be between ${ROAD_LIMITS.bank_deg.min}° and ${ROAD_LIMITS.bank_deg.max}° (got ${s.bank_deg}°).`,
      );
    if (s.transition_m < 0.25 * s.length_m && s.angle_deg > 8)
      warnings.push(
        `Slope #${i + 1}: transition length is short for a ${s.angle_deg}° grade — vehicle may lose traction.`,
      );
  }
  const slopeTotal = input.slopes.reduce((acc, s) => acc + s.length_m + s.transition_m, 0);
  if (slopeTotal > input.length_m)
    errors.push(
      `Sum of slope segments (${Math.round(slopeTotal)} m) exceeds road length (${input.length_m} m).`,
    );

  // Curves
  const sorted = [...input.curves].sort((a, b) => a.station - b.station);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const minR =
      c.type === "hairpin_left" || c.type === "hairpin_right" ? 10 : c.type === "banked" ? 30 : 20;
    if (c.radius < minR)
      errors.push(`Curve #${i + 1} (${c.type}): radius ${c.radius} m below minimum ${minR} m.`);
    if (c.length_m <= 0) errors.push(`Curve #${i + 1}: length must be positive.`);
    if (
      !Number.isFinite(c.bank_deg) ||
      c.bank_deg < ROAD_LIMITS.bank_deg.min ||
      c.bank_deg > ROAD_LIMITS.bank_deg.max
    )
      errors.push(
        `Curve #${i + 1}: bank must be between ${ROAD_LIMITS.bank_deg.min}° and ${ROAD_LIMITS.bank_deg.max}° (got ${c.bank_deg}°).`,
      );
    if (c.station < 0 || c.station > input.length_m)
      errors.push(`Curve #${i + 1}: station ${c.station} m outside road (0–${input.length_m} m).`);
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevEnd = prev.station + prev.length_m;
      if (c.station < prevEnd)
        errors.push(
          `Curve #${i + 1} overlaps previous curve (starts at ${c.station} m, previous ends at ${Math.round(prevEnd)} m).`,
        );
    }
    // continuity — max delta heading per curve length
    const maxDeltaDeg = (c.length_m / c.radius) * (180 / Math.PI);
    if (c.angle_deg > maxDeltaDeg + 1)
      warnings.push(
        `Curve #${i + 1}: angle (${c.angle_deg}°) exceeds arc capacity (${maxDeltaDeg.toFixed(1)}°) — spline will be clipped.`,
      );
  }

  return { ok: errors.length === 0, errors, warnings };
}
