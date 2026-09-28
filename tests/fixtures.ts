import type { VehicleSpec } from "@/lib/physics";
import type { RoadSpec } from "@/lib/physics/simulation";

export const TEST_VEHICLE: VehicleSpec = {
  mass_kg: 1500,
  wheelbase_m: 2.7,
  track_m: 1.6,
  cog_height_m: 0.55,
  frontal_area_m2: 2.2,
  drag_coeff: 0.29,
  rolling_resist_coeff: 0.012,
  tire_friction_mu: 1.0,
  max_power_kw: 150,
  max_torque_nm: 300,
  engine_efficiency: 0.32,
  fuel_energy_mj_per_l: 34.2,
  fuel_type: "gasoline",
};

export const roadStraight = (length_m: number): RoadSpec => ({
  length_m,
  surface_mu: 1.0,
  base_slope_deg: 0,
  curves: [],
});

export const roadCurved = (length_m: number): RoadSpec => ({
  length_m,
  surface_mu: 1.0,
  base_slope_deg: 0,
  // one sweeping right-hand curve mid-course
  curves: [{ station: length_m * 0.3, radius: 120, angle_deg: 60, bank_deg: 2 }],
});

export const roadMixed = (length_m: number): RoadSpec => ({
  length_m,
  surface_mu: 0.95,
  base_slope_deg: 1,
  curves: [
    { station: length_m * 0.2, radius: 200, angle_deg: 45 },
    { station: length_m * 0.55, radius: 80, angle_deg: 90, bank_deg: 4 },
    { station: length_m * 0.85, radius: 300, angle_deg: 30 },
  ],
});
