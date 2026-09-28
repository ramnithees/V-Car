export const CATEGORIES = [
  "sedan",
  "suv",
  "truck",
  "sports",
  "off_road",
  "motorcycle",
  "commercial",
  "ev",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FUELS = ["petrol", "diesel", "electric", "hybrid", "cng"] as const;
export type Fuel = (typeof FUELS)[number];

export const VEHICLE_TYPES = [
  "passenger",
  "performance",
  "utility",
  "commercial",
  "prototype",
] as const;
export const ENGINE_TYPES = [
  "inline",
  "v",
  "flat",
  "rotary",
  "electric_motor",
  "hybrid_series",
  "hybrid_parallel",
] as const;
export const TRANSMISSION_TYPES = [
  "manual",
  "automatic",
  "amt",
  "cvt",
  "dct",
  "single_speed",
] as const;
export const DRIVE_LAYOUTS = ["fwd", "rwd", "awd", "4wd"] as const;
export const DIFFERENTIALS = ["open", "limited_slip", "locking", "torque_vectoring"] as const;
export const TIRE_TYPES = [
  "summer",
  "all_season",
  "winter",
  "performance",
  "off_road",
  "slick",
] as const;
export const BRAKE_TYPES = ["disc_ventilated", "disc_solid", "drum", "carbon_ceramic"] as const;

export interface VehicleWizardData {
  // Step 1
  name: string;
  manufacturer: string;
  category: Category;
  vehicle_type: string;
  model_year: number;

  // Step 2
  fuel_type: Fuel;
  engine_type: string;
  displacement_cc: number;
  power_value: number;
  power_unit: "kW" | "HP";
  max_torque_nm: number;
  max_rpm: number;
  idle_rpm: number;
  cylinders?: number;
  compression_ratio?: number;
  turbocharged?: boolean;

  // Step 3
  transmission_type: string;
  drive_layout: string;
  num_gears: number;
  final_drive_ratio?: number;
  differential_type?: string;

  // Step 4
  mass_kg: number; // kerb
  gvw_kg: number;
  wheelbase_mm: number;
  front_track_mm: number;
  rear_track_mm: number;
  cog_height_mm: number;
  ground_clearance_mm: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;

  // Step 5
  tire_radius_m: number;
  tire_friction_mu: number;
  tire_type: string;
  tire_width_mm?: number;
  tire_pressure_kpa?: number;

  // Step 6
  front_brake_type: string;
  rear_brake_type: string;
  brake_efficiency: number;
  has_abs?: boolean;
  has_esc?: boolean;
  has_ebd?: boolean;

  // Step 7
  drag_coeff: number;
  frontal_area_m2: number;
  lift_coeff?: number;
  rear_spoiler?: boolean;

  // Step 8
  top_speed_kmh: number;
  tank_capacity_l: number;
  fuel_efficiency: number; // km/L or kWh/100km depending on fuel
  zero_to_100_s?: number;
}

export const INITIAL: VehicleWizardData = {
  name: "",
  manufacturer: "",
  category: "sedan",
  vehicle_type: "passenger",
  model_year: new Date().getFullYear(),

  fuel_type: "petrol",
  engine_type: "inline",
  displacement_cc: 1998,
  power_value: 110,
  power_unit: "kW",
  max_torque_nm: 250,
  max_rpm: 6500,
  idle_rpm: 800,
  cylinders: 4,
  compression_ratio: 10.5,
  turbocharged: false,

  transmission_type: "automatic",
  drive_layout: "fwd",
  num_gears: 6,
  final_drive_ratio: 3.5,
  differential_type: "open",

  mass_kg: 1400,
  gvw_kg: 1900,
  wheelbase_mm: 2700,
  front_track_mm: 1550,
  rear_track_mm: 1550,
  cog_height_mm: 550,
  ground_clearance_mm: 150,
  length_mm: 4600,
  width_mm: 1800,
  height_mm: 1450,

  tire_radius_m: 0.32,
  tire_friction_mu: 0.9,
  tire_type: "all_season",
  tire_width_mm: 215,
  tire_pressure_kpa: 230,

  front_brake_type: "disc_ventilated",
  rear_brake_type: "disc_solid",
  brake_efficiency: 0.85,
  has_abs: true,
  has_esc: true,
  has_ebd: true,

  drag_coeff: 0.3,
  frontal_area_m2: 2.2,
  lift_coeff: 0,
  rear_spoiler: false,

  top_speed_kmh: 210,
  tank_capacity_l: 50,
  fuel_efficiency: 15,
  zero_to_100_s: 8.5,
};

/** Map wizard state to a `vehicles` insert row. */
export function toInsertRow(d: VehicleWizardData, ownerId: string) {
  const power_kw = d.power_unit === "HP" ? d.power_value * 0.7457 : d.power_value;
  const track_m = (d.front_track_mm + d.rear_track_mm) / 2 / 1000;

  // Fuel energy defaults by fuel type (MJ/L; electric uses per-kWh dummy 3.6 MJ/kWh, tank stores kWh).
  const fuelEnergy: Record<string, number> = {
    petrol: 32,
    diesel: 36,
    electric: 3.6,
    hybrid: 32,
    cng: 24,
  };

  // Approximate engine efficiency by fuel
  const efficiency: Record<string, number> = {
    petrol: 0.32,
    diesel: 0.4,
    electric: 0.9,
    hybrid: 0.36,
    cng: 0.3,
  };

  return {
    owner_id: ownerId,
    is_public: false,
    // Base engineering columns
    name: d.name.trim(),
    manufacturer: d.manufacturer.trim() || null,
    category: d.category,
    mass_kg: d.mass_kg,
    wheelbase_m: d.wheelbase_mm / 1000,
    track_m,
    cog_height_m: d.cog_height_mm / 1000,
    frontal_area_m2: d.frontal_area_m2,
    drag_coeff: d.drag_coeff,
    rolling_resist_coeff: 0.012,
    tire_friction_mu: d.tire_friction_mu,
    max_power_kw: power_kw,
    max_torque_nm: d.max_torque_nm,
    top_speed_kmh: d.top_speed_kmh,
    fuel_type: d.fuel_type,
    engine_efficiency: efficiency[d.fuel_type] ?? 0.32,
    fuel_energy_mj_per_l: fuelEnergy[d.fuel_type] ?? 32,
    tank_capacity_l: d.tank_capacity_l,
    // Extended engineering columns
    vehicle_type: d.vehicle_type,
    model_year: d.model_year,
    engine_type: d.engine_type,
    displacement_cc: d.displacement_cc,
    max_rpm: d.max_rpm,
    idle_rpm: d.idle_rpm,
    cylinders: d.cylinders ?? null,
    compression_ratio: d.compression_ratio ?? null,
    turbocharged: d.turbocharged ?? null,
    transmission_type: d.transmission_type,
    drive_layout: d.drive_layout,
    num_gears: d.num_gears,
    final_drive_ratio: d.final_drive_ratio ?? null,
    differential_type: d.differential_type ?? null,
    gvw_kg: d.gvw_kg,
    front_track_m: d.front_track_mm / 1000,
    rear_track_m: d.rear_track_mm / 1000,
    ground_clearance_m: d.ground_clearance_mm / 1000,
    length_m: d.length_mm ? d.length_mm / 1000 : null,
    width_m: d.width_mm ? d.width_mm / 1000 : null,
    height_m: d.height_mm ? d.height_mm / 1000 : null,
    tire_radius_m: d.tire_radius_m,
    tire_type: d.tire_type,
    tire_width_mm: d.tire_width_mm ?? null,
    tire_pressure_kpa: d.tire_pressure_kpa ?? null,
    front_brake_type: d.front_brake_type,
    rear_brake_type: d.rear_brake_type,
    brake_efficiency: d.brake_efficiency,
    has_abs: d.has_abs ?? null,
    has_esc: d.has_esc ?? null,
    has_ebd: d.has_ebd ?? null,
    lift_coeff: d.lift_coeff ?? null,
    rear_spoiler: d.rear_spoiler ?? null,
    zero_to_100_s: d.zero_to_100_s ?? null,
    fuel_efficiency: d.fuel_efficiency,
  };
}
