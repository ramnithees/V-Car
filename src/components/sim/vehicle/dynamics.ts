import { createContext, useContext, useRef } from "react";

/**
 * Vehicle dynamic state shared from the Vehicle controller down to every
 * subcomponent (Lights, Wheels, Interior, Suspension, Steering).
 *
 * The Vehicle's single useFrame writes these mutable slots each frame; the
 * subcomponents' own useFrames read them to update material.emissiveIntensity,
 * mesh.position / rotation, etc. Everything is a ref — no React re-renders.
 */
export interface VehicleDynamics {
  susPos: [number, number, number, number]; // meters, +compressed
  steerL: { v: number };
  steerR: { v: number };
  steerAvgDeg: { v: number };
  speedMps: { v: number };
  throttle: { v: number };
  brake: { v: number };
  brakeGlow: { v: number };
  reverseOn: { v: number };
  headlightsOn: { v: number };
  drlOn: { v: number };
  fogOn: { v: number };
  indicatorL: { v: number };
  indicatorR: { v: number };
  interiorOn: { v: number };
  time: { v: number };
}

export function createVehicleDynamics(): VehicleDynamics {
  return {
    susPos: [0, 0, 0, 0],
    steerL: { v: 0 },
    steerR: { v: 0 },
    steerAvgDeg: { v: 0 },
    speedMps: { v: 0 },
    throttle: { v: 0 },
    brake: { v: 0 },
    brakeGlow: { v: 0 },
    reverseOn: { v: 0 },
    headlightsOn: { v: 1 },
    drlOn: { v: 1 },
    fogOn: { v: 0 },
    indicatorL: { v: 0 },
    indicatorR: { v: 0 },
    interiorOn: { v: 1 },
    time: { v: 0 },
  };
}

export const VehicleDynamicsCtx = createContext<VehicleDynamics | null>(null);

export function useVehicleDynamics(): VehicleDynamics {
  const ctx = useContext(VehicleDynamicsCtx);
  if (!ctx) throw new Error("VehicleDynamicsCtx missing");
  return ctx;
}

/** Convenience: stable dynamics ref for a single vehicle instance. */
export function useDynamicsRef(): VehicleDynamics {
  const ref = useRef<VehicleDynamics | null>(null);
  if (!ref.current) ref.current = createVehicleDynamics();
  return ref.current;
}
