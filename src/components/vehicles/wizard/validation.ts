import type { VehicleWizardData } from "./types";

export type StepErrors = Record<string, string>;
export interface ValidationResult {
  ok: boolean;
  errors: StepErrors;
  warnings: string[];
}

function inRange(v: number, min: number, max: number) {
  return Number.isFinite(v) && v >= min && v <= max;
}

/** Returns errors for the requested step (0-indexed). */
export function validateStep(step: number, d: VehicleWizardData): ValidationResult {
  const errors: StepErrors = {};
  const warnings: string[] = [];

  const req = (cond: unknown, key: string, msg: string) => {
    if (!cond) errors[key] = msg;
  };

  switch (step) {
    case 0: {
      req(d.name.trim().length > 0, "name", "Name is required");
      req(d.manufacturer.trim().length > 0, "manufacturer", "Manufacturer is required");
      req(!!d.vehicle_type, "vehicle_type", "Vehicle type is required");
      req(
        inRange(d.model_year, 1900, new Date().getFullYear() + 3),
        "model_year",
        "Model year 1900–next 3 yrs",
      );
      break;
    }
    case 1: {
      req(!!d.fuel_type, "fuel_type", "Fuel type required");
      req(!!d.engine_type, "engine_type", "Engine type required");
      if (d.fuel_type !== "electric") {
        req(inRange(d.displacement_cc, 50, 20000), "displacement_cc", "Displacement 50–20000 cc");
      }
      req(
        inRange(d.power_value, 1, d.power_unit === "HP" ? 3000 : 2200),
        "power_value",
        "Unrealistic power",
      );
      req(inRange(d.max_torque_nm, 5, 20000), "max_torque_nm", "Torque 5–20000 Nm");
      req(inRange(d.max_rpm, 500, 25000), "max_rpm", "Max RPM 500–25000");
      req(inRange(d.idle_rpm, 0, d.max_rpm - 100), "idle_rpm", "Idle RPM must be below max RPM");
      break;
    }
    case 2: {
      req(!!d.transmission_type, "transmission_type", "Transmission type required");
      req(!!d.drive_layout, "drive_layout", "Drive layout required");
      req(inRange(d.num_gears, 1, 12), "num_gears", "Gears 1–12");
      break;
    }
    case 3: {
      req(inRange(d.mass_kg, 100, 60000), "mass_kg", "Kerb weight 100–60000 kg");
      req(inRange(d.gvw_kg, d.mass_kg, 200000), "gvw_kg", "GVW must be ≥ kerb weight");
      req(inRange(d.wheelbase_mm, 800, 8000), "wheelbase_mm", "Wheelbase 800–8000 mm");
      req(inRange(d.front_track_mm, 600, 3000), "front_track_mm", "Front track 600–3000 mm");
      req(inRange(d.rear_track_mm, 600, 3000), "rear_track_mm", "Rear track 600–3000 mm");
      req(inRange(d.cog_height_mm, 100, 2500), "cog_height_mm", "CoG height 100–2500 mm");
      req(
        inRange(d.ground_clearance_mm, 20, 800),
        "ground_clearance_mm",
        "Ground clearance 20–800 mm",
      );
      // Cross-field
      if (!errors.cog_height_mm && !errors.wheelbase_mm && d.cog_height_mm >= d.wheelbase_mm) {
        errors.cog_height_mm = "CoG height cannot exceed wheelbase";
      }
      if (!errors.front_track_mm && !errors.rear_track_mm) {
        const ratio =
          Math.max(d.front_track_mm, d.rear_track_mm) / Math.min(d.front_track_mm, d.rear_track_mm);
        if (ratio > 1.3) warnings.push("Front/rear track differ by >30% — unusual geometry");
      }
      if (!errors.gvw_kg && d.gvw_kg > d.mass_kg * 4)
        warnings.push("GVW is more than 4× kerb weight");
      break;
    }
    case 4: {
      req(inRange(d.tire_radius_m, 0.15, 1.2), "tire_radius_m", "Tire radius 0.15–1.2 m");
      req(inRange(d.tire_friction_mu, 0.1, 1.6), "tire_friction_mu", "Tire μ 0.1–1.6");
      req(!!d.tire_type, "tire_type", "Tire type required");
      break;
    }
    case 5: {
      req(!!d.front_brake_type, "front_brake_type", "Front brake type required");
      req(!!d.rear_brake_type, "rear_brake_type", "Rear brake type required");
      req(inRange(d.brake_efficiency, 0.2, 1.0), "brake_efficiency", "Brake efficiency 0.2–1.0");
      break;
    }
    case 6: {
      req(inRange(d.drag_coeff, 0.1, 1.5), "drag_coeff", "Cd 0.1–1.5");
      req(inRange(d.frontal_area_m2, 0.5, 15), "frontal_area_m2", "Frontal area 0.5–15 m²");
      break;
    }
    case 7: {
      req(inRange(d.top_speed_kmh, 20, 600), "top_speed_kmh", "Top speed 20–600 km/h");
      req(inRange(d.tank_capacity_l, 1, 2000), "tank_capacity_l", "Tank 1–2000 L (or kWh)");
      req(inRange(d.fuel_efficiency, 0.1, 200), "fuel_efficiency", "Fuel efficiency out of range");
      break;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

/** Cross-step engineering plausibility check (run before save). */
export function validateAll(d: VehicleWizardData): ValidationResult {
  const errors: StepErrors = {};
  const warnings: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = validateStep(i, d);
    Object.assign(errors, r.errors);
    warnings.push(...r.warnings);
  }
  // Power-to-weight (kW per tonne)
  const power_kw = d.power_unit === "HP" ? d.power_value * 0.7457 : d.power_value;
  const pwr_ratio = (power_kw / d.mass_kg) * 1000;
  if (!Object.keys(errors).length && (pwr_ratio < 5 || pwr_ratio > 2000)) {
    errors.power_value = `Power-to-weight ratio ${pwr_ratio.toFixed(1)} kW/t is implausible`;
  }
  return { ok: Object.keys(errors).length === 0, errors, warnings };
}
