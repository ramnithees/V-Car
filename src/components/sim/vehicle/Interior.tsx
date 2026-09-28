import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { interiorLeather, interiorTrim, chromeMat, plasticMat } from "./materials";
import { useVehicleDynamics } from "./dynamics";

/**
 * Cabin interior — dashboard, cluster housing, seats (2 front bucket +
 * rear bench), centre console + gear knob, pedals, rear-view mirror,
 * and an animated steering wheel driven by the average front-wheel
 * steering angle (with realistic ~14:1 gear ratio → ±540° lock-to-lock).
 */
export function Interior() {
  const dyn = useVehicleDynamics();
  const wheel = useRef<THREE.Group>(null);

  useFrame(() => {
    const avg = (dyn.steerL.v + dyn.steerR.v) * 0.5;
    // 14:1 → wheel rotates ~14× the road-wheel angle. Clamp so rims of the
    // rim mesh don't spin past ±3π (about ±540°).
    if (wheel.current) {
      const target = THREE.MathUtils.clamp(avg * 14, -Math.PI * 3, Math.PI * 3);
      wheel.current.rotation.z = target;
    }
  });

  return (
    <group>
      {/* Dashboard sweep */}
      <mesh position={[0, 0.7, -0.68]} material={interiorTrim}>
        <boxGeometry args={[1.55, 0.32, 0.42]} />
      </mesh>
      {/* Cluster housing */}
      <mesh position={[0.4, 0.86, -0.72]} material={plasticMat}>
        <boxGeometry args={[0.42, 0.16, 0.08]} />
      </mesh>

      {/* Steering wheel assembly */}
      <group position={[0.4, 0.82, -0.55]} rotation={[-0.55, 0, 0]}>
        <group ref={wheel}>
          {/* Rim */}
          <mesh material={interiorLeather}>
            <torusGeometry args={[0.17, 0.022, 10, 32]} />
          </mesh>
          {/* Three spokes */}
          {[0, 2, 4].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 6]} material={interiorTrim}>
              <boxGeometry args={[0.32, 0.02, 0.03]} />
            </mesh>
          ))}
          {/* Center hub */}
          <mesh material={interiorTrim}>
            <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
          </mesh>
        </group>
      </group>

      {/* Centre console */}
      <mesh position={[0, 0.55, -0.05]} material={interiorTrim}>
        <boxGeometry args={[0.32, 0.2, 0.9]} />
      </mesh>
      {/* Gear knob */}
      <mesh position={[0, 0.72, 0.15]} material={chromeMat}>
        <sphereGeometry args={[0.05, 16, 12]} />
      </mesh>

      {/* Pedals (visible near floor, driver side) */}
      {[
        [-0.05, 0],
        [0.06, 0],
      ].map(([dx], i) => (
        <mesh key={i} position={[0.4 + dx, 0.32, -0.4]} material={chromeMat}>
          <boxGeometry args={[0.06, 0.02, 0.1]} />
        </mesh>
      ))}

      {/* Front seats */}
      {[0.4, -0.4].map((x, i) => (
        <group key={i} position={[x, 0.5, -0.05]}>
          {/* Base */}
          <mesh material={interiorLeather}>
            <boxGeometry args={[0.55, 0.18, 0.55]} />
          </mesh>
          {/* Back */}
          <mesh position={[0, 0.4, 0.25]} rotation={[0.15, 0, 0]} material={interiorLeather}>
            <boxGeometry args={[0.55, 0.7, 0.14]} />
          </mesh>
          {/* Headrest */}
          <mesh position={[0, 0.85, 0.28]} material={interiorLeather}>
            <boxGeometry args={[0.28, 0.2, 0.14]} />
          </mesh>
        </group>
      ))}

      {/* Rear bench */}
      <mesh position={[0, 0.5, 0.85]} material={interiorLeather}>
        <boxGeometry args={[1.4, 0.18, 0.55]} />
      </mesh>
      <mesh position={[0, 0.85, 1.1]} rotation={[0.15, 0, 0]} material={interiorLeather}>
        <boxGeometry args={[1.4, 0.6, 0.14]} />
      </mesh>

      {/* Rear-view mirror on windshield header */}
      <mesh position={[0, 1.05, -0.55]} material={interiorTrim}>
        <boxGeometry args={[0.24, 0.06, 0.03]} />
      </mesh>
    </group>
  );
}
