import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeEmissive } from "./materials";
import { useVehicleDynamics } from "./dynamics";
import { indicatorPhase } from "./helpers";

/**
 * Vehicle lighting cluster — DRL, low/high beam, fog, tail, brake, reverse,
 * L/R indicators + hazard, plus interior dashboard illumination.
 *
 * All emissive intensities are driven from `VehicleDynamics` refs each
 * frame (no React re-renders). Real light sources (SpotLight) are LOD-gated
 * to keep the cost of shadow-casting cones bounded.
 */
export function Lights() {
  const dyn = useVehicleDynamics();

  // Independent material instances → refs can mutate emissiveIntensity freely.
  const mats = useMemo(
    () => ({
      drlL: makeEmissive("#eaf5ff", 1.2),
      drlR: makeEmissive("#eaf5ff", 1.2),
      lowL: makeEmissive("#fff7d8", 0.8),
      lowR: makeEmissive("#fff7d8", 0.8),
      fogL: makeEmissive("#fff2b0", 0),
      fogR: makeEmissive("#fff2b0", 0),
      tailL: makeEmissive("#ff2a2a", 0.35),
      tailR: makeEmissive("#ff2a2a", 0.35),
      brakeCenter: makeEmissive("#ff1a1a", 0),
      reverseL: makeEmissive("#f5f5ff", 0),
      reverseR: makeEmissive("#f5f5ff", 0),
      indL_front: makeEmissive("#ffb020", 0),
      indL_rear: makeEmissive("#ffb020", 0),
      indR_front: makeEmissive("#ffb020", 0),
      indR_rear: makeEmissive("#ffb020", 0),
      dashGlow: makeEmissive("#3ad0ff", 0.4),
    }),
    [],
  );

  const spotFL = useRef<THREE.SpotLight>(null);
  const spotFR = useRef<THREE.SpotLight>(null);

  useFrame(() => {
    const t = dyn.time.v;
    // brake / tail
    const brake = dyn.brake.v;
    const glow = dyn.brakeGlow.v;
    mats.tailL.emissiveIntensity = 0.35 + brake * 1.8;
    mats.tailR.emissiveIntensity = 0.35 + brake * 1.8;
    mats.brakeCenter.emissiveIntensity = brake * 3.0;
    // reverse
    const rev = dyn.reverseOn.v;
    mats.reverseL.emissiveIntensity = rev * 2.0;
    mats.reverseR.emissiveIntensity = rev * 2.0;
    // DRL / headlights / fog
    mats.drlL.emissiveIntensity = dyn.drlOn.v * 1.4;
    mats.drlR.emissiveIntensity = dyn.drlOn.v * 1.4;
    mats.lowL.emissiveIntensity = dyn.headlightsOn.v * 2.2;
    mats.lowR.emissiveIntensity = dyn.headlightsOn.v * 2.2;
    mats.fogL.emissiveIntensity = dyn.fogOn.v * 1.5;
    mats.fogR.emissiveIntensity = dyn.fogOn.v * 1.5;
    // indicators — 1.5 Hz blink when active
    const blink = indicatorPhase(t);
    const iL = dyn.indicatorL.v * blink;
    const iR = dyn.indicatorR.v * blink;
    mats.indL_front.emissiveIntensity = iL * 2.4;
    mats.indL_rear.emissiveIntensity = iL * 2.4;
    mats.indR_front.emissiveIntensity = iR * 2.4;
    mats.indR_rear.emissiveIntensity = iR * 2.4;
    // interior
    mats.dashGlow.emissiveIntensity = dyn.interiorOn.v * 0.6;
    // spot cones follow headlight state
    const sp = dyn.headlightsOn.v;
    if (spotFL.current) spotFL.current.intensity = sp * 90;
    if (spotFR.current) spotFR.current.intensity = sp * 90;
    // brake disc heat glow — used by wheels via dyn.brakeGlow
    void glow;
  });

  const F = -2.06;
  const R = 2.06;

  return (
    <group>
      {/* ── Front: slim horizontal LED headlight bars flanking the grille */}
      <mesh position={[0.58, 0.2, F - 0.005]} material={mats.drlL}>
        <boxGeometry args={[0.44, 0.04, 0.02]} />
      </mesh>
      <mesh position={[-0.58, 0.2, F - 0.005]} material={mats.drlR}>
        <boxGeometry args={[0.44, 0.04, 0.02]} />
      </mesh>

      {/* Low-beam projector strip (below DRL) */}
      <mesh position={[0.58, 0.13, F - 0.005]} material={mats.lowL}>
        <boxGeometry args={[0.38, 0.05, 0.02]} />
      </mesh>
      <mesh position={[-0.58, 0.13, F - 0.005]} material={mats.lowR}>
        <boxGeometry args={[0.38, 0.05, 0.02]} />
      </mesh>

      {/* Fog lamps — small squares in the lower corners */}
      <mesh position={[0.78, -0.08, F - 0.005]} material={mats.fogL}>
        <boxGeometry args={[0.1, 0.05, 0.02]} />
      </mesh>
      <mesh position={[-0.78, -0.08, F - 0.005]} material={mats.fogR}>
        <boxGeometry args={[0.1, 0.05, 0.02]} />
      </mesh>

      {/* Front indicators — outboard amber accents at the end of the LED bar */}
      <mesh position={[0.83, 0.2, F - 0.005]} material={mats.indL_front}>
        <boxGeometry args={[0.06, 0.04, 0.02]} />
      </mesh>
      <mesh position={[-0.83, 0.2, F - 0.005]} material={mats.indR_front}>
        <boxGeometry args={[0.06, 0.04, 0.02]} />
      </mesh>

      {/* ── Rear: full-width slim LED taillight bar (split with center gap) */}
      <mesh position={[0.42, 0.2, R + 0.005]} material={mats.tailL}>
        <boxGeometry args={[0.7, 0.05, 0.02]} />
      </mesh>
      <mesh position={[-0.42, 0.2, R + 0.005]} material={mats.tailR}>
        <boxGeometry args={[0.7, 0.05, 0.02]} />
      </mesh>
      {/* CHMSL centre brake light (roofline) */}
      <mesh position={[0, 0.72, R - 0.02]} material={mats.brakeCenter}>
        <boxGeometry args={[0.4, 0.02, 0.02]} />
      </mesh>
      {/* Reverse — small white pill under the taillight bar */}
      <mesh position={[0.3, 0.1, R + 0.005]} material={mats.reverseL}>
        <boxGeometry args={[0.12, 0.03, 0.02]} />
      </mesh>
      <mesh position={[-0.3, 0.1, R + 0.005]} material={mats.reverseR}>
        <boxGeometry args={[0.12, 0.03, 0.02]} />
      </mesh>
      {/* Rear indicators — outboard on the LED strip */}
      <mesh position={[0.82, 0.2, R + 0.005]} material={mats.indL_rear}>
        <boxGeometry args={[0.08, 0.04, 0.02]} />
      </mesh>
      <mesh position={[-0.82, 0.2, R + 0.005]} material={mats.indR_rear}>
        <boxGeometry args={[0.08, 0.04, 0.02]} />
      </mesh>

      {/* Real spot cones for the headlights (LOD would be nice; kept modest) */}
      <spotLight
        ref={spotFL}
        position={[0.62, 0.55, F]}
        target-position={[3, 0, F - 20]}
        angle={0.55}
        penumbra={0.6}
        distance={70}
        decay={1.5}
        intensity={0}
        color={"#fff2c8"}
      />
      <spotLight
        ref={spotFR}
        position={[-0.62, 0.55, F]}
        target-position={[-3, 0, F - 20]}
        angle={0.55}
        penumbra={0.6}
        distance={70}
        decay={1.5}
        intensity={0}
        color={"#fff2c8"}
      />

      {/* Interior dashboard glow strip (visible through windshield) */}
      <mesh position={[0, 0.72, -0.75]} material={mats.dashGlow}>
        <boxGeometry args={[1.4, 0.02, 0.35]} />
      </mesh>
    </group>
  );
}
