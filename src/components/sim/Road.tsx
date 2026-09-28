import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";
import { asphaltTexture, asphaltNormalTexture, asphaltRoughnessTexture } from "./textures";

/**
 * Road Generator (Phase 3).
 * - Catmull-Rom subdivided ribbon with thickness (asphalt slab)
 * - Painted paved shoulders
 * - White edge lines (both sides)
 * - Double yellow center: two solid outer lines + dashed inner (per lane-standard)
 * - Emissive cat-eye reflectors along the centre
 * - Instanced delineator posts along both edges (white/red reflective tips)
 * - Chevron warning signs on tight curves (radius < 60m)
 * - km stones every 1000m
 */
export function Road({ samples, width = 8 }: { samples: PathSample[]; width?: number }) {
  const built = useMemo(() => {
    if (samples.length < 2) return null;

    const raw = samples.map((s) => new THREE.Vector3(s.x, s.z, s.y));
    const curve = new THREE.CatmullRomCurve3(raw, false, "catmullrom", 0.5);
    const subCount = Math.max(samples.length * 4, 240);
    const pts = curve.getPoints(subCount);

    const halfW = width / 2;
    const shoulderW = halfW + 1.8;
    const asphaltPos: number[] = [];
    const asphaltUv: number[] = [];
    const asphaltIdx: number[] = [];
    const shoulderPos: number[] = [];
    const shoulderIdx: number[] = [];
    const leftLinePos: number[] = [];
    const leftLineIdx: number[] = [];
    const rightLinePos: number[] = [];
    const rightLineIdx: number[] = [];
    // double yellow: two solid outer strips + centre dashed
    const yLPos: number[] = [],
      yLIdx: number[] = [];
    const yRPos: number[] = [],
      yRIdx: number[] = [];
    const dashes: Array<{ pos: [number, number, number]; heading: number }> = [];
    const reflectors: Array<[number, number, number]> = [];
    const delineators: Array<{ pos: [number, number, number]; heading: number; side: number }> = [];
    const chevrons: Array<{ pos: [number, number, number]; heading: number }> = [];
    const kmStones: Array<{ pos: [number, number, number]; heading: number; km: number }> = [];

    // side-wall extrusion (thickness)
    const wallLPos: number[] = [],
      wallLIdx: number[] = [];
    const wallRPos: number[] = [],
      wallRIdx: number[] = [];
    const THICK = 0.18;

    let uAcc = 0;
    let sAcc = 0;
    let nextKm = 1000;

    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const nxt = pts[Math.min(i + 1, pts.length - 1)];
      const prev = pts[Math.max(i - 1, 0)];
      const dx = nxt.x - cur.x;
      const dz = nxt.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const elev = cur.y + 0.02;
      const heading = Math.atan2(dz, dx);

      // Bank at this ribbon vertex — linear-interp between the two nearest
      // raw samples so cross-sections change continuously (no faceted twist).
      const fSrc = (i / Math.max(1, pts.length - 1)) * (samples.length - 1);
      const i0 = Math.floor(fSrc);
      const i1 = Math.min(samples.length - 1, i0 + 1);
      const tSrc = fSrc - i0;
      const bank = (samples[i0]?.bank_rad ?? 0) * (1 - tSrc) + (samples[i1]?.bank_rad ?? 0) * tSrc;
      const sinB = Math.sin(bank);
      // Positive bank (curve-left / bank_dir=left) → left edge lifts, right edge drops.
      const leftLift = halfW * sinB;
      const rightLift = -halfW * sinB;
      const leftLiftS = shoulderW * sinB;
      const rightLiftS = -shoulderW * sinB;

      // curvature (approx) for chevron placement
      const px = cur.x - prev.x,
        pz = cur.z - prev.z;
      const cross = px * dz - pz * dx;
      const curvature = Math.abs(cross) / Math.max(0.001, Math.hypot(px, pz) * len);

      // asphalt
      const lxA = cur.x + nx * halfW,
        lzA = cur.z + nz * halfW;
      const rxA = cur.x - nx * halfW,
        rzA = cur.z - nz * halfW;
      asphaltPos.push(lxA, elev + leftLift, -lzA, rxA, elev + rightLift, -rzA);
      asphaltUv.push(0, uAcc * 0.15, 1, uAcc * 0.15);

      // shoulder (paved lighter)
      const lxS = cur.x + nx * shoulderW,
        lzS = cur.z + nz * shoulderW;
      const rxS = cur.x - nx * shoulderW,
        rzS = cur.z - nz * shoulderW;
      shoulderPos.push(lxS, elev - 0.01 + leftLiftS, -lzS, rxS, elev - 0.01 + rightLiftS, -rzS);

      // side walls: from asphalt edge down to elev-THICK
      wallLPos.push(lxA, elev + leftLift, -lzA, lxA, elev + leftLift - THICK, -lzA);
      wallRPos.push(rxA, elev + rightLift, -rzA, rxA, elev + rightLift - THICK, -rzA);

      // white edge lines (follow bank)
      const lineW = 0.16;
      leftLinePos.push(
        cur.x + nx * (halfW - lineW / 2),
        elev + 0.008 + leftLift,
        -(cur.z + nz * (halfW - lineW / 2)),
        cur.x + nx * (halfW + lineW / 2),
        elev + 0.008 + leftLift,
        -(cur.z + nz * (halfW + lineW / 2)),
      );
      rightLinePos.push(
        cur.x - nx * (halfW - lineW / 2),
        elev + 0.008 + rightLift,
        -(cur.z - nz * (halfW - lineW / 2)),
        cur.x - nx * (halfW + lineW / 2),
        elev + 0.008 + rightLift,
        -(cur.z - nz * (halfW + lineW / 2)),
      );

      // double yellow: two thin solid strips flanking centre
      const yOff = 0.22;
      const yW = 0.12;
      yLPos.push(
        cur.x + nx * (yOff - yW / 2),
        elev + 0.008,
        -(cur.z + nz * (yOff - yW / 2)),
        cur.x + nx * (yOff + yW / 2),
        elev + 0.008,
        -(cur.z + nz * (yOff + yW / 2)),
      );
      yRPos.push(
        cur.x - nx * (yOff - yW / 2),
        elev + 0.008,
        -(cur.z - nz * (yOff - yW / 2)),
        cur.x - nx * (yOff + yW / 2),
        elev + 0.008,
        -(cur.z - nz * (yOff + yW / 2)),
      );

      if (i < pts.length - 1) {
        const a = i * 2;
        asphaltIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        shoulderIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        leftLineIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        rightLineIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        yLIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        yRIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        wallLIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        wallRIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }

      uAcc += len;
      sAcc += len;

      // inner broken centre dash (short + gap)
      if (i % 6 === 0) {
        dashes.push({ pos: [cur.x, elev + 0.011, -cur.z], heading });
      }
      // cat-eye reflectors every ~14 subs (~ periodic)
      if (i % 14 === 7) {
        reflectors.push([cur.x, elev + 0.02, -cur.z]);
      }
      // delineator posts every ~24 subs
      if (i % 24 === 0) {
        const off = shoulderW + 0.6;
        delineators.push({
          pos: [cur.x + nx * off, elev, -(cur.z + nz * off)],
          heading,
          side: +1,
        });
        delineators.push({
          pos: [cur.x - nx * off, elev, -(cur.z - nz * off)],
          heading,
          side: -1,
        });
      }
      // chevron on outer side of tight curves
      if (curvature > 0.015 && i % 8 === 0) {
        const outer = cross > 0 ? -1 : 1;
        const off = shoulderW + 2.2;
        chevrons.push({
          pos: [cur.x + outer * nx * off, elev + 0.6, -(cur.z + outer * nz * off)],
          heading: heading + (outer < 0 ? Math.PI : 0),
        });
      }
      // km stones
      if (sAcc >= nextKm) {
        const off = shoulderW + 1.2;
        kmStones.push({
          pos: [cur.x + nx * off, elev, -(cur.z + nz * off)],
          heading,
          km: nextKm / 1000,
        });
        nextKm += 1000;
      }
    }

    const buildIndexed = (pos: number[], idx: number[], uv?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };

    return {
      asphalt: buildIndexed(asphaltPos, asphaltIdx, asphaltUv),
      shoulder: buildIndexed(shoulderPos, shoulderIdx),
      leftLine: buildIndexed(leftLinePos, leftLineIdx),
      rightLine: buildIndexed(rightLinePos, rightLineIdx),
      yLine: buildIndexed(yLPos, yLIdx),
      yLine2: buildIndexed(yRPos, yRIdx),
      wallL: buildIndexed(wallLPos, wallLIdx),
      wallR: buildIndexed(wallRPos, wallRIdx),
      dashes,
      reflectors,
      delineators,
      chevrons,
      kmStones,
    };
  }, [samples, width]);

  const asphaltMat = useMemo(() => {
    const map = asphaltTexture();
    const nrm = asphaltNormalTexture();
    const rough = asphaltRoughnessTexture();
    // Independent tiling per map — colour repeats slower than roughness so
    // wet/dry variation reads as physical rather than tiled.
    map.repeat.set(1, 1);
    nrm.repeat.set(2, 2);
    rough.repeat.set(1.5, 1.5);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: rough,
      roughness: 0.92,
      metalness: 0.04,
      color: "#4a4e56",
      envMapIntensity: 0.35,
    });
  }, []);
  const shoulderMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a5148", roughness: 0.95 }),
    [],
  );
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 1 }),
    [],
  );
  const lineMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f6f6f4",
        roughness: 0.45,
        metalness: 0.18,
        emissive: "#3a3a34",
        emissiveIntensity: 0.18,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  const yellowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffd54a",
        roughness: 0.45,
        metalness: 0.22,
        emissive: "#a97e0a",
        emissiveIntensity: 0.22,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  const dashMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffd54a",
        roughness: 0.45,
        metalness: 0.22,
        emissive: "#a97e0a",
        emissiveIntensity: 0.22,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  const reflectorGeom = useMemo(() => new THREE.SphereGeometry(0.09, 6, 6), []);
  const reflectorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffe28a",
        emissive: "#ffb020",
        emissiveIntensity: 0.9,
        roughness: 0.3,
      }),
    [],
  );
  // delineator: white pole + red tip
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.5 }),
    [],
  );
  const poleTipGeom = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), []);
  const poleTipMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ff2b2b",
        emissive: "#ff0000",
        emissiveIntensity: 0.6,
        roughness: 0.4,
      }),
    [],
  );

  const reflectorRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const poleTipRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!built) return;
    const d = new THREE.Object3D();
    if (reflectorRef.current) {
      built.reflectors.forEach((p, i) => {
        d.position.set(p[0], p[1], p[2]);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        reflectorRef.current!.setMatrixAt(i, d.matrix);
      });
      reflectorRef.current.instanceMatrix.needsUpdate = true;
    }
    if (poleRef.current) {
      built.delineators.forEach((p, i) => {
        d.position.set(p.pos[0], p.pos[1] + 0.5, p.pos[2]);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        poleRef.current!.setMatrixAt(i, d.matrix);
      });
      poleRef.current.instanceMatrix.needsUpdate = true;
    }
    if (poleTipRef.current) {
      built.delineators.forEach((p, i) => {
        d.position.set(p.pos[0], p.pos[1] + 1.02, p.pos[2]);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        poleTipRef.current!.setMatrixAt(i, d.matrix);
      });
      poleTipRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [built]);

  if (!built) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];

  return (
    <group>
      <mesh geometry={built.shoulder} material={shoulderMat} receiveShadow />
      <mesh geometry={built.asphalt} material={asphaltMat} receiveShadow castShadow />
      <mesh geometry={built.wallL} material={wallMat} />
      <mesh geometry={built.wallR} material={wallMat} />
      <mesh geometry={built.leftLine} material={lineMat} />
      <mesh geometry={built.rightLine} material={lineMat} />
      <mesh geometry={built.yLine} material={yellowMat} />
      <mesh geometry={built.yLine2} material={yellowMat} />
      {built.dashes.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={[-Math.PI / 2, 0, -d.heading]} material={dashMat}>
          <planeGeometry args={[2.0, 0.14]} />
        </mesh>
      ))}
      {built.reflectors.length > 0 && (
        <instancedMesh
          ref={reflectorRef}
          args={[reflectorGeom, reflectorMat, built.reflectors.length]}
        />
      )}
      {built.delineators.length > 0 && (
        <>
          <instancedMesh
            ref={poleRef}
            args={[poleGeom, poleMat, built.delineators.length]}
            castShadow
          />
          <instancedMesh
            ref={poleTipRef}
            args={[poleTipGeom, poleTipMat, built.delineators.length]}
          />
        </>
      )}
      {/* Chevron signs (small warning triangles on posts) */}
      {built.chevrons.map((c, i) => (
        <group key={`chev-${i}`} position={c.pos} rotation={[0, -c.heading, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />
            <meshStandardMaterial color="#dadada" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <planeGeometry args={[0.7, 0.5]} />
            <meshStandardMaterial
              color="#ffd54a"
              side={THREE.DoubleSide}
              emissive="#c88a00"
              emissiveIntensity={0.25}
              roughness={0.5}
            />
          </mesh>
        </group>
      ))}
      {/* KM stones */}
      {built.kmStones.map((s, i) => (
        <group key={`km-${i}`} position={s.pos} rotation={[0, -s.heading, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[0.45, 0.7, 0.25]} />
            <meshStandardMaterial color="#f0f0ec" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.6, 0.13]}>
            <planeGeometry args={[0.4, 0.2]} />
            <meshStandardMaterial color="#ff2b2b" emissive="#ff2b2b" emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}
      {/* Start / finish markers preserved */}
      <mesh position={[first.x, first.z + 0.03, -first.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[last.x, last.z + 0.03, -last.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
