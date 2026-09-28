export const SURFACE_TYPES = [
  "asphalt",
  "concrete",
  "gravel",
  "mud",
  "snow",
  "ice",
  "sand",
  "wet_asphalt",
] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

export const SURFACE_MU: Record<SurfaceType, number> = {
  asphalt: 0.9,
  concrete: 0.85,
  gravel: 0.6,
  mud: 0.4,
  snow: 0.3,
  ice: 0.15,
  sand: 0.45,
  wet_asphalt: 0.65,
};

export const SURFACE_LABEL: Record<SurfaceType, string> = {
  asphalt: "Asphalt",
  concrete: "Concrete",
  gravel: "Gravel",
  mud: "Mud",
  snow: "Snow",
  ice: "Ice",
  sand: "Sand",
  wet_asphalt: "Wet Asphalt",
};
