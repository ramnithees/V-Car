import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * LodInstancedMesh
 *
 * Distance-based Level-of-Detail wrapper around <instancedMesh>. Each frame
 * (throttled) we compare the camera position to each instance's world position:
 *
 *   d <= nearDist       -> full render + shadow casting (if castShadow)
 *   nearDist < d <= farDist -> full render, shadow casting suppressed at the
 *                              mesh level once no instance is within nearDist
 *   d > farDist         -> instance matrix collapsed to zero-scale (culled)
 *
 * Because InstancedMesh has a single `castShadow` flag, shadow tiering is done
 * per-mesh (disabled when the *closest* instance is beyond `nearDist`). This
 * gives big wins on shadow-map cost when the camera drives away from a cluster
 * without any per-instance hacks that would create popping.
 *
 * The build callback receives a shared Object3D for base-matrix construction —
 * we cache those matrices once and only stamp either the base matrix or a
 * hidden matrix each LOD tick, so the per-tick cost is a Matrix4.copy per
 * instance and a single instanceMatrix upload.
 */
interface LodProps<T> {
  instances: T[];
  geom: THREE.BufferGeometry;
  mat: THREE.Material;
  build: (obj: THREE.Object3D, inst: T) => void;
  posOf: (inst: T) => readonly [number, number, number];
  farDist: number;
  nearDist?: number;
  castShadow?: boolean;
  frustumCulled?: boolean;
  intervalMs?: number;
}

export function LodInstancedMesh<T>({
  instances,
  geom,
  mat,
  build,
  posOf,
  farDist,
  nearDist,
  castShadow = false,
  frustumCulled = true,
  intervalMs = 140,
}: LodProps<T>) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hiddenMat = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const baseMatrices = useMemo(
    () => Array.from({ length: instances.length }, () => new THREE.Matrix4()),
    [instances.length],
  );
  const positions = useMemo(() => instances.map((inst) => posOf(inst)), [instances, posOf]);
  const visibleFlags = useMemo(() => new Uint8Array(instances.length), [instances.length]);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const lastTick = useRef(-Infinity);

  // Initial matrix stamp — also the fallback when no LOD tick has run yet.
  useLayoutEffect(() => {
    if (!ref.current) return;
    const d = new THREE.Object3D();
    for (let i = 0; i < instances.length; i++) {
      build(d, instances[i]);
      d.updateMatrix();
      baseMatrices[i].copy(d.matrix);
      ref.current.setMatrixAt(i, d.matrix);
      visibleFlags[i] = 1;
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [instances, baseMatrices, visibleFlags, build]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh || instances.length === 0) return;
    const now = state.clock.elapsedTime * 1000;
    if (now - lastTick.current < intervalMs) return;
    lastTick.current = now;

    state.camera.getWorldPosition(camPos);
    const cx = camPos.x,
      cy = camPos.y,
      cz = camPos.z;
    const far2 = farDist * farDist;
    const near2 = nearDist !== undefined ? nearDist * nearDist : Infinity;

    let dirty = false;
    let anyInNear = false;

    for (let i = 0; i < instances.length; i++) {
      const p = positions[i];
      const dx = p[0] - cx,
        dy = p[1] - cy,
        dz = p[2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const nextVisible = d2 <= far2 ? 1 : 0;
      if (nextVisible !== visibleFlags[i]) {
        mesh.setMatrixAt(i, nextVisible ? baseMatrices[i] : hiddenMat);
        visibleFlags[i] = nextVisible;
        dirty = true;
      }
      if (nextVisible && d2 <= near2) anyInNear = true;
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;

    // Shadow tier: only cast shadows while at least one instance is inside
    // the near ring. Toggling castShadow on the whole InstancedMesh drops
    // its entire batch from the shadow pass — a large win for shadow-map
    // fill when the camera is far from a cluster.
    if (castShadow && nearDist !== undefined) {
      mesh.castShadow = anyInNear;
    }
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geom, mat, instances.length]}
      castShadow={castShadow}
      frustumCulled={frustumCulled}
    />
  );
}
