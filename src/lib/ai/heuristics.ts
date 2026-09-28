/**
 * Deterministic AI-style predictions derived from physics.
 * These are the ground truth the LLM narrates over.
 */
import type { SimResults } from "@/lib/physics/simulation";
import type { VehicleSpec } from "@/lib/physics";

export interface AIPrediction {
  safety_score: number;
  risk_level: "low" | "moderate" | "high" | "critical";
  skid_probability: number; // 0..1
  rollover_probability: number; // 0..1
  recommended_cruise_kmh: number;
  fuel_optimal_kmh: number;
  key_risks: string[];
  recommendations: string[];
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Safety verdict.
 *
 * The adaptive controller keeps the vehicle *at* its safe cap, so raw margin below
 * the cap (min_safety_score) is close to 100 even on a route that is physically
 * saturated. Exposure therefore has three independent inputs:
 *
 *  1. margin  — how far below the cap the controller had to run (classic term)
 *  2. exposure — fraction of the route spent pinned at the physical limit
 *  3. severity — peak lateral demand relative to the grip / rollover ceilings
 *
 * A run that is rollover-limited for most of its length at high lateral g is a
 * high-risk run even though the controller never exceeded the cap.
 */
export function predictFromResults(v: VehicleSpec, r: SimResults): AIPrediction {
  const s = r.summary;
  const ssf = v.track_m / (2 * v.cog_height_m);
  const mu = v.tire_friction_mu;

  const atLimit = clamp(s.at_limit_fraction ?? 0, 0, 1);
  const events = s.limiting_events ?? [];
  const rolloverEvents = events.filter((e) => e.limiting === "rollover").length;
  const skidEvents = events.filter((e) => e.limiting === "skid").length;
  const totalEvents = rolloverEvents + skidEvents;
  const rolloverShare = totalEvents > 0 ? rolloverEvents / totalEvents : 0;
  const skidShare = totalEvents > 0 ? skidEvents / totalEvents : 0;

  // 1. Margin loss below the safe cap (0..1)
  const margin = clamp((100 - s.min_safety_score) / 20, 0, 1);
  // 2. Exposure: time spent saturated. Ramps in quickly — 50 % of the route at
  //    the limit is already a serious operating condition.
  const exposure = clamp(atLimit / 0.5, 0, 1);
  // 3. Severity of the lateral demand against each physical ceiling.
  const skidSeverity = clamp(s.max_lat_g / Math.max(0.3, mu), 0, 1.2);
  const rollSeverity = clamp(s.max_lat_g / Math.max(0.6, ssf), 0, 1.2);

  const skidP = clamp(
    Math.max(margin, exposure * skidShare) * clamp(skidSeverity, 0.25, 1.2),
    0,
    1,
  );
  const rollP = clamp(
    Math.max(margin, exposure * rolloverShare) * clamp(rollSeverity, 0.25, 1.2),
    0,
    1,
  );

  // Composite score: start from the controller margin, then penalise saturation
  // and the severity of the dominant limiting mode.
  const marginScore = clamp(s.avg_safety_score, 0, 100);
  const exposurePenalty = exposure * 35;
  const severityPenalty = clamp(Math.max(skidSeverity, rollSeverity) - 0.7, 0, 0.5) * 60;
  const gradePenalty = clamp((s.max_slope_deg - 8) / 12, 0, 1) * 8;
  const score = Math.round(
    clamp(marginScore - exposurePenalty - severityPenalty - gradePenalty, 0, 100),
  );

  const worst = Math.max(skidP, rollP);
  const risk: AIPrediction["risk_level"] =
    score < 40 || worst > 0.75
      ? "critical"
      : score < 60 || worst > 0.5
        ? "high"
        : score < 80 || worst > 0.25
          ? "moderate"
          : "low";

  const risks: string[] = [];
  if (atLimit > 0.15) {
    const mode = rolloverShare >= skidShare ? "rollover" : "skid";
    risks.push(
      `Vehicle held at its physical ${mode} limit for ${(atLimit * 100).toFixed(0)}% of the route — no reserve for evasive manoeuvres.`,
    );
  }
  if (rollP > 0.3)
    risks.push(
      `Rollover exposure ${(rollP * 100).toFixed(0)}% — SSF ${ssf.toFixed(2)} vs peak lateral ${s.max_lat_g.toFixed(2)} g.`,
    );
  if (skidP > 0.3)
    risks.push(
      `Skid exposure ${(skidP * 100).toFixed(0)}% — peak lateral ${s.max_lat_g.toFixed(2)} g against available grip μ ${mu.toFixed(2)}.`,
    );
  if (s.min_safety_score < 40)
    risks.push(
      `Safety margin critical at ${s.min_safety_score.toFixed(0)}/100 in the tightest curve.`,
    );
  if (s.max_slope_deg > 8)
    risks.push(
      `Sustained grade of ${s.max_slope_deg.toFixed(1)}° impacts braking distance and fuel consumption.`,
    );
  if (rolloverEvents > 0)
    risks.push(
      `${rolloverEvents} rollover-limited station${rolloverEvents === 1 ? "" : "s"} and ${skidEvents} skid-limited station${skidEvents === 1 ? "" : "s"} recorded.`,
    );

  const recs: string[] = [];
  const cruiseKmh = Math.min(s.top_speed_kmh, s.avg_speed_kmh + 15);
  recs.push(
    `Recommended cruise speed: ${cruiseKmh.toFixed(0)} km/h — matches adaptive safe cap on straights.`,
  );
  recs.push(
    `Controller held vehicle at the safe cap for ${(atLimit * 100).toFixed(0)}% of the run.`,
  );
  const fuelOptimal = Math.max(60, Math.min(90, cruiseKmh - 15));
  recs.push(
    `Fuel-optimal steady cruise ≈ ${fuelOptimal.toFixed(0)} km/h based on drag & rolling losses.`,
  );
  if (exposure > 0.5)
    recs.push(
      "Reduce driver target speed or ease the route geometry — the run is limited by physics, not by the driver.",
    );
  if (rollP > 0.3) recs.push("Consider stiffer anti-roll bars or lowered CoG to increase SSF.");
  if (skidP > 0.3)
    recs.push("Higher grip tires (μ ≥ 1.0) or wider contact patch would raise the skid ceiling.");

  return {
    safety_score: score,
    risk_level: risk,
    skid_probability: skidP,
    rollover_probability: rollP,
    recommended_cruise_kmh: cruiseKmh,
    fuel_optimal_kmh: fuelOptimal,
    key_risks: risks,
    recommendations: recs,
  };
}
