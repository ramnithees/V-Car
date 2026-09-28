import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geom, darkTrimMat, chromeMat } from "./materials";
import { useVehicleDynamics } from "./dynamics";

/**
 * Visible suspension arms + coil spring + damper for a single corner.
 * Length of the spring/damper stretches with per-corner compression
 * (dyn.susPos[cornerIdx]).
 */
export function SuspensionCorner({
  cornerIdx,
  side, // side = +1 for left (+X), -1 for right (-X)
}: {
  cornerIdx: 0 | 1 | 2 | 3;
  side: 1 | -1;
}) {
  const dyn = useVehicleDynamics();
  const spring = useRef<THREE.Mesh>(null);
  const damper = useRef<THREE.Mesh>(null);

  useFrame(() => {
    // Compression: +compressed → spring shorter, damper shorter.
    const c = dyn.susPos[cornerIdx];
    const scale = Math.max(0.55, Math.min(1.25, 1 - c * 3));
    if (spring.current) {
      spring.current.scale.y = scale;
      spring.current.position.y = 0.15 - (1 - scale) * 0.14;
    }
    if (damper.current) {
      damper.current.scale.y = scale;
      damper.current.position.y = 0.15 - (1 - scale) * 0.14;
    }
  });

  return (
    <group>
      {/* Upper A-arm */}
      <mesh position={[-side * 0.22, 0.28, 0]} geometry={geom.aArm} material={darkTrimMat} />
      {/* Lower A-arm */}
      <mesh position={[-side * 0.22, 0.05, 0]} geometry={geom.aArm} material={darkTrimMat} />
      {/* Coil spring */}
      <mesh
        ref={spring}
        position={[-side * 0.1, 0.15, 0]}
        geometry={geom.spring}
        material={chromeMat}
      />
      {/* Damper cylinder inside */}
      <mesh
        ref={damper}
        position={[-side * 0.1, 0.15, 0.02]}
        geometry={geom.damper}
        material={darkTrimMat}
      />
    </group>
  );
}
