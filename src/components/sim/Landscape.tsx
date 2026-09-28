import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";
import { hash2 } from "./textures";
import type { TerrainSampler } from "./terrain-height";
import { computeLandscape } from "./placement";

/**
 * Landscape enrichment: rocks and small ponds scattered on the terrain,
 * placed away from the road corridor. All Y positions come from the shared
 * terrain sampler so nothing floats or clips.
 */
export function Landscape({
  samples,
  sampler,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
}) {
  // Placement lives in ./placement (pure, corridor-guarded, unit-tested).
  const { rocks, ponds } = useMemo(() => computeLandscape(samples, sampler), [samples, sampler]);

  return (
    <group>
      <Rocks rocks={rocks} />
      {ponds.map((p, i) => (
        <Pond key={i} pond={p} />
      ))}
    </group>
  );
}

function Rocks({
  rocks,
}: {
  rocks: Array<{ x: number; y: number; z: number; scale: number; rot: number }>;
}) {
  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Slight vertex jitter for irregular rock silhouette (deterministic per vertex)
    for (let i = 0; i < pos.count; i++) {
      const j = 1 + (hash2(i, 3) - 0.5) * 0.35;
      pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8a8781", roughness: 0.95 }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    rocks.forEach((r, i) => {
      d.position.set(r.x, r.y + r.scale * 0.3, r.z);
      d.rotation.set(0, r.rot, 0);
      d.scale.setScalar(r.scale);
      d.updateMatrix();
      ref.current?.setMatrixAt(i, d.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [rocks]);
  if (!rocks.length) return null;
  return <instancedMesh ref={ref} args={[geom, mat, rocks.length]} castShadow receiveShadow />;
}

function Pond({ pond }: { pond: { x: number; y: number; z: number; radius: number } }) {
  return (
    <group position={[pond.x, pond.y + 0.02, pond.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[pond.radius, 24]} />
        <meshStandardMaterial
          color="#2a5a7e"
          transparent
          opacity={0.85}
          roughness={0.15}
          metalness={0.35}
        />
      </mesh>
      {/* Rim: darker ring, slightly below water */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[pond.radius, pond.radius + 1.6, 24]} />
        <meshStandardMaterial color="#5c4a35" roughness={1} />
      </mesh>
    </group>
  );
}
