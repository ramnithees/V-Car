import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geom, darkTrimMat, chromeMat } from "./materials";
import { useVehicleDynamics } from "./dynamics";

/**
 * Steering rack + tie rods + column. Rack shifts on X with steering angle;
 * tie rods pivot toward each front hub.
 */
export function Steering() {
  const dyn = useVehicleDynamics();
  const rack = useRef<THREE.Mesh>(null);
  const tieL = useRef<THREE.Mesh>(null);
  const tieR = useRef<THREE.Mesh>(null);
  const column = useRef<THREE.Mesh>(null);

  useFrame(() => {
    // Rack shift proportional to average of front-wheel angles
    const avg = (dyn.steerL.v + dyn.steerR.v) * 0.5;
    if (rack.current) rack.current.position.x = avg * 0.08;
    if (tieL.current) tieL.current.rotation.y = dyn.steerL.v * 0.6;
    if (tieR.current) tieR.current.rotation.y = dyn.steerR.v * 0.6;
    // Column visible turn (mostly hidden, cabin shell in front)
    if (column.current) column.current.rotation.z = -avg * 3.0;
  });

  return (
    <group position={[0, 0.15, -1.35]}>
      {/* Rack across the front axle */}
      <mesh ref={rack} geometry={geom.rack} material={darkTrimMat} />
      {/* Tie rods */}
      <mesh ref={tieL} position={[0.55, 0, 0]} geometry={geom.tieRod} material={chromeMat} />
      <mesh ref={tieR} position={[-0.55, 0, 0]} geometry={geom.tieRod} material={chromeMat} />
      {/* Steering column (angled up into cabin) */}
      <mesh
        ref={column}
        position={[0.4, 0.35, 0.55]}
        rotation={[-0.55, 0, 0]}
        material={darkTrimMat}
      >
        <cylinderGeometry args={[0.02, 0.02, 0.9, 12]} />
      </mesh>
    </group>
  );
}
