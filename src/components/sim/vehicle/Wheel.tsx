import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geom, rubberMat, rimMat, caliperMat } from "./materials";
import { useVehicleDynamics } from "./dynamics";

/**
 * Detailed wheel — tire (cylinder + tread ring), rim, 10 spokes,
 * hub cap, 5 lug nuts, brake disc (with heat glow), caliper.
 *
 * `outward` = +1 for LEFT wheels (mesh at +X), -1 for RIGHT.
 * The wheel spin (rotation.x) is applied by the Vehicle controller on the
 * parent group; this component only renders the visual assembly and
 * updates brake disc emissive intensity per frame.
 */
export function Wheel({ outward }: { outward: 1 | -1 }) {
  const dyn = useVehicleDynamics();
  const discMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3d4048",
        metalness: 0.7,
        roughness: 0.35,
        emissive: new THREE.Color("#ff3300"),
        emissiveIntensity: 0,
      }),
    [],
  );
  const discRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    // Brake disc heat glow — brakeGlow (0..1) → emissive 0..2.5
    discMat.emissiveIntensity = dyn.brakeGlow.v * 2.5;
    void discRef;
  });

  const spokes = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);
  const treadBlocks = useMemo(() => Array.from({ length: 28 }, (_, i) => i), []);

  return (
    <group>
      {/* Tire */}
      <mesh castShadow rotation={[0, 0, Math.PI / 2]} geometry={geom.tire} material={rubberMat} />
      {/* Outer tread ring */}
      <mesh rotation={[0, 0, Math.PI / 2]} geometry={geom.tireTread} material={rubberMat} />
      {/* Radial tread lugs (visible grooves at low poly) */}
      {treadBlocks.map((i) => {
        const a = (i * 2 * Math.PI) / treadBlocks.length;
        const r = 0.365;
        return (
          <mesh
            key={`tr-${i}`}
            position={[0, Math.cos(a) * r, Math.sin(a) * r]}
            rotation={[a, 0, 0]}
            material={rubberMat}
          >
            <boxGeometry args={[0.22, 0.018, 0.05]} />
          </mesh>
        );
      })}

      {/* Rim body */}
      <mesh rotation={[0, 0, Math.PI / 2]} geometry={geom.rim} material={rimMat} />

      {/* Rim face (outer visible dish) */}
      <mesh
        position={[outward * 0.125, 0, 0]}
        rotation={[0, outward > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
        geometry={geom.rimFace}
        material={rimMat}
      />

      {/* 10 spokes */}
      {spokes.map((i) => {
        const a = (i * Math.PI) / 5;
        return (
          <mesh key={i} position={[outward * 0.11, 0, 0]} rotation={[a, 0, 0]} material={rimMat}>
            <boxGeometry args={[0.02, 0.03, 0.44]} />
          </mesh>
        );
      })}

      {/* Hub cap */}
      <mesh
        position={[outward * 0.14, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        geometry={geom.hub}
        material={rimMat}
      />

      {/* 5 lug nuts */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * 2 * Math.PI) / 5;
        return (
          <mesh
            key={i}
            position={[outward * 0.145, Math.cos(a) * 0.05, Math.sin(a) * 0.05]}
            rotation={[0, 0, Math.PI / 2]}
            geometry={geom.lugNut}
            material={rimMat}
          />
        );
      })}

      {/* Brake disc (inner) */}
      <mesh
        ref={discRef}
        position={[-outward * 0.06, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        geometry={geom.brakeDisc}
        material={discMat}
      />
      {/* Brake caliper (fixed relative to hub, doesn't spin — but rendered
          inside the spinning wheel group for simplicity; visually acceptable). */}
      <mesh
        position={[-outward * 0.06, 0.22, 0.02]}
        geometry={geom.brakeCaliper}
        material={caliperMat}
      />
    </group>
  );
}
