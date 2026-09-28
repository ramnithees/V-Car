import { useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import * as THREE from "three";
import { Sky, Cloud, Clouds } from "@react-three/drei";
import { usePlayback } from "./store";
import type { PathSample } from "./store";
import { grassTexture, terrainBlendTexture, barkTexture } from "./textures";
import { LodInstancedMesh } from "./lod";
import { createTerrainSampler, type TerrainSampler } from "./terrain-height";
import {
  computeVegetation,
  computeGrassTufts,
  type TreeInstance,
  type BushInstance,
} from "./placement";
import { FacilityComplex } from "./facility/FacilityComplex";
import { Infrastructure } from "./Infrastructure";
import { RoadsideKit } from "./RoadsideKit";
import { Landscape } from "./Landscape";

/**
 * SimEnvironment — road ↔ terrain integration owner.
 *
 * The sampler is built once from the road samples and used by:
 *   - TerrainSurface  (vertex Y comes from sampler.heightAt)
 *   - GrassTufts / Vegetation / Buildings (placement Y comes from sampler.heightAt)
 *   - DistantHorizon  (hillOnly, no road influence)
 *
 * Because the terrain and every placed prop share one height function, the
 * road is embedded in a smooth 10 m roadbed + 50 m embankment corridor — no
 * floating road, no clipping, no floating trees/grass.
 */
export function SimEnvironment({ samples }: { samples: PathSample[] }) {
  const sampler = useMemo(() => createTerrainSampler(samples), [samples]);

  // Publish the shared sampler so Cameras.tsx can query terrain height for
  // its clearance guard (chase / side / drone must never sink into a hill).
  useEffect(() => {
    usePlayback.getState().setTerrainSampler(sampler);
    return () => usePlayback.getState().setTerrainSampler(null);
  }, [sampler]);

  // Sim-space centre (used for Sky/Cloud/Mountain placement so their pivots
  // sit above the middle of the road region). world_x = sim.x, world_z = -sim.y.
  const centre = useMemo(() => {
    if (!samples.length) return { cxSim: 0, cySim: 0 };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const s of samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    return { cxSim: (minX + maxX) / 2, cySim: (minY + maxY) / 2 };
  }, [samples]);
  const cx = centre.cxSim;
  const cy = centre.cySim; // sim y; world z = -cy

  return (
    <group>
      <Sky
        sunPosition={[80, 30, 20]}
        turbidity={3}
        rayleigh={1.4}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
      />
      <Clouds material={THREE.MeshBasicMaterial} limit={40}>
        <Cloud
          seed={1}
          segments={30}
          bounds={[220, 8, 220]}
          volume={80}
          position={[cx, 140, -cy - 200]}
          color="#ffffff"
          opacity={0.55}
        />
        <Cloud
          seed={4}
          segments={26}
          bounds={[180, 6, 180]}
          volume={60}
          position={[cx + 260, 165, -cy + 180]}
          color="#f4f7fb"
          opacity={0.45}
        />
        <Cloud
          seed={7}
          segments={24}
          bounds={[160, 5, 160]}
          volume={55}
          position={[cx - 300, 155, -cy - 60]}
          color="#eef2f8"
          opacity={0.4}
        />
      </Clouds>
      <DistantHorizon centreX={cx} centreZ={-cy} />
      <hemisphereLight args={["#cfe0f5", "#3a4a2a", 0.7]} />
      <ambientLight intensity={0.28} />
      {/* Fill directional — no shadow map (sun in Sim3DScene owns shadows) */}
      <directionalLight position={[80, 120, 40]} intensity={1.35} />

      <TerrainSurface sampler={sampler} />
      <GrassTufts samples={samples} sampler={sampler} />
      <Vegetation samples={samples} sampler={sampler} />
      <RoadsideBarriers sampler={sampler} />
      <LightPoles sampler={sampler} />
      <FacilityComplex samples={samples} sampler={sampler} />
      <Infrastructure samples={samples} sampler={sampler} />
      <RoadsideKit samples={samples} />
      <Landscape samples={samples} sampler={sampler} />
    </group>
  );
}

/* ------------------------------ Distant Horizon --------------------------- */
/**
 * Two-band mountain ring, both bands anchored at ground level (Y = 0) rather
 * than the old "float at Y=40" cylinder. Bottom of each band sits below the
 * terrain so no straight vertical seam is ever visible. Fog is disabled on
 * these materials so scene fog doesn't clip the far half of the ring into
 * the "wall" the user reported.
 *
 * Near band (dark ridge)  : R ≈ 1050, ridge amplitude ~90 m
 * Far band  (hazy silhouette): R ≈ 1750, ridge amplitude ~140 m, softer colour
 */
function DistantHorizon({ centreX, centreZ }: { centreX: number; centreZ: number }) {
  const bands = useMemo(() => {
    const build = (R: number, ampA: number, ampB: number, colour: string, seed: number) => {
      const segs = 180;
      // Tall cylinder — bottom is buried well below any terrain we generate.
      const g = new THREE.CylinderGeometry(R, R, 260, segs, 1, true);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y <= 0) continue; // only lift the top ring into a ridge
        const x = pos.getX(i),
          z = pos.getZ(i);
        const ang = Math.atan2(z, x);
        // deterministic per-band ridge profile
        const ridge =
          Math.abs(Math.sin(ang * 5 + seed)) * ampA +
          Math.abs(Math.sin(ang * 11 + seed * 2 + 0.7)) * ampB;
        pos.setY(i, y + ridge);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      const m = new THREE.MeshBasicMaterial({
        color: colour,
        side: THREE.BackSide,
        fog: false, // don't let scene fog swallow the ring
        depthWrite: false,
      });
      return { geo: g, mat: m };
    };
    return {
      near: build(1450, 55, 18, "#6f8aa2", 0.3),
      far: build(2350, 90, 26, "#a6b6c8", 1.9),
    };
  }, []);

  // Bury the bottom of the cylinders well below terrain (Y = -110) so the
  // vertical side quads never emerge as a visible wall.
  return (
    <group>
      <mesh
        geometry={bands.far.geo}
        material={bands.far.mat}
        position={[centreX, -110, centreZ]}
        renderOrder={-2}
      />
      <mesh
        geometry={bands.near.geo}
        material={bands.near.mat}
        position={[centreX, -110, centreZ]}
        renderOrder={-1}
      />
    </group>
  );
}

/* --------------------------------- Terrain -------------------------------- */
/**
 * Single high-res displaced plane driven by the shared height sampler.
 *
 * Resolution:
 *   Spacing target = 4.5 m per segment (fine enough to seat an 8 m road
 *   corridor with a 50 m embankment). Segs clamped to [140, 320] so we never
 *   go below usable fidelity or blow past ~100k vertices.
 *
 * Texture repeat is deliberately low-frequency to avoid the previous ~15×
 * tile pattern; the terrainBlendTexture is fBm-based so seams read as
 * organic colour variation rather than a grid.
 */
function TerrainSurface({ sampler }: { sampler: TerrainSampler }) {
  const { bounds } = sampler;

  const geo = useMemo(() => {
    const spacing = 4.5;
    const segX = THREE.MathUtils.clamp(Math.round(bounds.sizeX / spacing), 140, 320);
    const segZ = THREE.MathUtils.clamp(Math.round(bounds.sizeZ / spacing), 140, 320);
    const g = new THREE.PlaneGeometry(bounds.sizeX, bounds.sizeZ, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Plane is centred at (0,0,0) after rotate; translate into world XZ
    // by adding the terrain centre. Y comes straight from the sampler,
    // so the road corridor is baked into the geometry.
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + bounds.cx;
      const wz = pos.getZ(i) + bounds.cz;
      pos.setY(i, sampler.heightAt(wx, wz));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [sampler, bounds]);

  const mat = useMemo(() => {
    const map = terrainBlendTexture();
    // Big organic tile (~200 m) — repeats but reads as natural colour drift.
    map.repeat.set(bounds.sizeX / 220, bounds.sizeZ / 220);
    // Kept for future roughness variation; not currently used but retains
    // the cached texture warm.
    const grass = grassTexture();
    grass.repeat.set(bounds.sizeX / 90, bounds.sizeZ / 90);
    return new THREE.MeshStandardMaterial({
      map,
      color: "#7d8a5c",
      roughness: 1,
      metalness: 0,
    });
  }, [bounds.sizeX, bounds.sizeZ]);

  return <mesh geometry={geo} material={mat} position={[bounds.cx, 0, bounds.cz]} receiveShadow />;
}

/* --------------------------------- Vegetation ------------------------------ */

function Vegetation({ samples, sampler }: { samples: PathSample[]; sampler: TerrainSampler }) {
  // Placement lives in ./placement (pure, corridor-guarded, unit-tested).
  const { trees, bushes } = useMemo(() => computeVegetation(samples, sampler), [samples, sampler]);

  // Species: 0 = pine (cone), 1 = broadleaf (sphere), 2 = tall broadleaf
  const pineByType = useMemo(() => trees.filter((t) => t.species === 0), [trees]);
  const roundByType = useMemo(() => trees.filter((t) => t.species === 1), [trees]);
  const tallByType = useMemo(() => trees.filter((t) => t.species === 2), [trees]);

  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.16, 0.24, 1.4, 8), []);
  const pineCanopy = useMemo(() => new THREE.ConeGeometry(1.2, 3.2, 10), []);
  const roundCanopy = useMemo(() => new THREE.SphereGeometry(1.4, 10, 8), []);
  const tallCanopy = useMemo(() => new THREE.SphereGeometry(1.1, 10, 8), []);

  const trunkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: barkTexture(),
        color: "#5a3922",
        roughness: 1,
      }),
    [],
  );
  const pineMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2f5a34", roughness: 0.92 }),
    [],
  );
  const roundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3d7a3a", roughness: 0.9 }),
    [],
  );
  const tallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a8a4a", roughness: 0.9 }),
    [],
  );
  const bushMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#456f38", roughness: 1 }),
    [],
  );
  const bushGeom = useMemo(() => new THREE.SphereGeometry(0.6, 8, 6), []);

  // Build callbacks are stable per-instance transforms — LodInstancedMesh
  // caches the resulting matrix and only swaps to a hidden matrix past farDist.
  const buildTrunk = useCallback((d: THREE.Object3D, t: TreeInstance) => {
    d.position.set(t.x, t.y + 0.7 * t.scale, t.z);
    d.rotation.set(0, t.rot, 0);
    d.scale.setScalar(t.scale);
  }, []);
  const buildCanopyFactory = useCallback(
    (yOff: number) => (d: THREE.Object3D, t: TreeInstance) => {
      d.position.set(t.x, t.y + yOff * t.scale, t.z);
      d.rotation.set(0, t.rot, 0);
      d.scale.setScalar(t.scale);
    },
    [],
  );
  const buildPine = useMemo(() => buildCanopyFactory(2.6), [buildCanopyFactory]);
  const buildRound = useMemo(() => buildCanopyFactory(2.4), [buildCanopyFactory]);
  const buildTall = useMemo(() => buildCanopyFactory(2.9), [buildCanopyFactory]);
  const buildBush = useCallback((d: THREE.Object3D, b: BushInstance) => {
    d.position.set(b.x, b.y + 0.3 * b.scale, b.z);
    d.rotation.set(0, b.rot, 0);
    d.scale.setScalar(b.scale);
  }, []);
  const treePos = useCallback((t: TreeInstance) => [t.x, t.y, t.z] as const, []);
  const bushPos = useCallback((b: BushInstance) => [b.x, b.y, b.z] as const, []);

  // LOD tiers (metres): shadow ring / cull ring.
  //   Trees   : shadow within 120m, drawn within 340m
  //   Bushes  : shadow within 55m,  drawn within 160m
  return (
    <group>
      {trees.length > 0 && (
        <LodInstancedMesh
          instances={trees}
          geom={trunkGeom}
          mat={trunkMat}
          build={buildTrunk}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {pineByType.length > 0 && (
        <LodInstancedMesh
          instances={pineByType}
          geom={pineCanopy}
          mat={pineMat}
          build={buildPine}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {roundByType.length > 0 && (
        <LodInstancedMesh
          instances={roundByType}
          geom={roundCanopy}
          mat={roundMat}
          build={buildRound}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {tallByType.length > 0 && (
        <LodInstancedMesh
          instances={tallByType}
          geom={tallCanopy}
          mat={tallMat}
          build={buildTall}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {bushes.length > 0 && (
        <LodInstancedMesh
          instances={bushes}
          geom={bushGeom}
          mat={bushMat}
          build={buildBush}
          posOf={bushPos}
          nearDist={55}
          farDist={160}
          castShadow
        />
      )}
    </group>
  );
}

/* ---------------------------- Roadside Barriers --------------------------- */
/**
 * W-beam guardrails attached to the shared road curve. Each barrier inherits
 * the station's tangent (heading), lateral offset along the outward normal,
 * and vertical lift from `elev + lateral * sin(bank)` — so on banked/sloped
 * roads the rails stay welded to the shoulder edge with zero clip/float.
 */
function RoadsideBarriers({ sampler }: { sampler: TerrainSampler }) {
  const barriers = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; heading: number }> = [];
    const curve = sampler.curve;
    if (!curve) return arr;
    const stations = curve.stations;
    // Space every ~6 m along arc; one barrier per side.
    const SPACING = 6;
    const OFF = 7.2; // just outside 5.8 m shoulder edge
    let sNext = 0;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (st.s < sNext && i !== stations.length - 1) continue;
      sNext = st.s + SPACING;
      for (const side of [1, -1] as const) {
        const lat = side * OFF;
        const wx = st.wx + st.nx * lat;
        const wz = st.wz + st.nz * lat;
        const wy = st.wy + lat * Math.sin(st.bank);
        arr.push({ x: wx, y: wy, z: wz, heading: st.heading });
      }
    }
    return arr;
  }, [sampler]);

  const geom = useMemo(() => new THREE.BoxGeometry(3, 0.55, 0.12), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.6, roughness: 0.35 }),
    [],
  );
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), []);
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6b6f78", metalness: 0.5, roughness: 0.6 }),
    [],
  );
  const railRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (railRef.current) {
      barriers.forEach((b, i) => {
        d.position.set(b.x, b.y + 0.55, b.z);
        d.rotation.set(0, -b.heading, 0);
        d.updateMatrix();
        railRef.current!.setMatrixAt(i, d.matrix);
      });
      railRef.current.instanceMatrix.needsUpdate = true;
    }
    if (postRef.current) {
      barriers.forEach((b, i) => {
        d.position.set(b.x, b.y + 0.35, b.z);
        d.rotation.set(0, -b.heading, 0);
        d.updateMatrix();
        postRef.current!.setMatrixAt(i, d.matrix);
      });
      postRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [barriers]);

  if (!barriers.length) return null;
  return (
    <group>
      <instancedMesh ref={railRef} args={[geom, mat, barriers.length]} castShadow />
      <instancedMesh ref={postRef} args={[postGeom, postMat, barriers.length]} castShadow />
    </group>
  );
}

/* ------------------------------- Light Poles ------------------------------ */

function LightPoles({ sampler }: { sampler: TerrainSampler }) {
  const poles = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; heading: number; side: 1 | -1 }> = [];
    const curve = sampler.curve;
    if (!curve) return arr;
    const stations = curve.stations;
    // Alternate sides every ~120 m along the arc.
    const SPACING = 60;
    const OFF = 8.5; // just past shoulder edge (5.8 m), inside 10 m flat buffer
    let sNext = 0;
    let flip = false;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (st.s < sNext && i !== stations.length - 1) continue;
      sNext = st.s + SPACING;
      const side: 1 | -1 = flip ? 1 : -1;
      flip = !flip;
      const lat = side * OFF;
      const wx = st.wx + st.nx * lat;
      const wz = st.wz + st.nz * lat;
      const wy = st.wy + lat * Math.sin(st.bank);
      arr.push({ x: wx, y: wy, z: wz, heading: st.heading, side });
    }
    return arr;
  }, [sampler]);

  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.09, 0.11, 6.4, 8), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(2.6, 0.08, 0.08), []);
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.9, 0.18, 0.35), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.4, roughness: 0.6 }),
    [],
  );
  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9cfd6",
        emissive: "#ffeecc",
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    [],
  );

  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (poleRef.current) {
      poles.forEach((p, i) => {
        d.position.set(p.x, p.y + 3.2, p.z);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        poleRef.current!.setMatrixAt(i, d.matrix);
      });
      poleRef.current.instanceMatrix.needsUpdate = true;
    }
    if (armRef.current) {
      poles.forEach((p, i) => {
        const nx = -Math.sin(p.heading),
          ny = Math.cos(p.heading);
        d.position.set(p.x - p.side * nx * 1.3, p.y + 6.2, p.z - p.side * -ny * 1.3);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        armRef.current!.setMatrixAt(i, d.matrix);
      });
      armRef.current.instanceMatrix.needsUpdate = true;
    }
    if (headRef.current) {
      poles.forEach((p, i) => {
        const nx = -Math.sin(p.heading),
          ny = Math.cos(p.heading);
        d.position.set(p.x - p.side * nx * 2.4, p.y + 6.1, p.z - p.side * -ny * 2.4);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        headRef.current!.setMatrixAt(i, d.matrix);
      });
      headRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [poles]);

  if (!poles.length) return null;
  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeom, poleMat, poles.length]} castShadow />
      <instancedMesh ref={armRef} args={[armGeom, poleMat, poles.length]} castShadow />
      <instancedMesh ref={headRef} args={[headGeom, headMat, poles.length]} />
    </group>
  );
}

/* ------------------------------ Grass Tufts ------------------------------- */

function GrassTufts({ samples, sampler }: { samples: PathSample[]; sampler: TerrainSampler }) {
  // Placement lives in ./placement (pure, corridor-guarded, unit-tested).
  const tufts = useMemo(() => computeGrassTufts(samples, sampler), [samples, sampler]);

  const geom = useMemo(() => {
    // Cross-billboard: two crossed vertical quads with alpha
    const g = new THREE.BufferGeometry();
    const w = 0.7,
      h = 0.5;
    const verts = new Float32Array([
      -w,
      0,
      0,
      w,
      0,
      0,
      w,
      h,
      0,
      -w,
      0,
      0,
      w,
      h,
      0,
      -w,
      h,
      0,
      0,
      0,
      -w,
      0,
      0,
      w,
      0,
      h,
      w,
      0,
      0,
      -w,
      0,
      h,
      w,
      0,
      h,
      -w,
    ]);
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }, []);

  const mat = useMemo(() => {
    // procedural grass-tuft alpha texture
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 22; i++) {
      const x = 8 + Math.random() * 48;
      const bh = 30 + Math.random() * 30;
      const shade = 60 + Math.floor(Math.random() * 60);
      ctx.strokeStyle = `rgba(${Math.floor(shade * 0.6)}, ${shade + 30}, ${Math.floor(shade * 0.55)}, 0.95)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.quadraticCurveTo(
        x + (Math.random() - 0.5) * 6,
        64 - bh / 2,
        x + (Math.random() - 0.5) * 8,
        64 - bh,
      );
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    });
  }, []);

  const buildTuft = useCallback(
    (d: THREE.Object3D, t: { x: number; y: number; z: number; rot: number; scale: number }) => {
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(0, t.rot, 0);
      d.scale.setScalar(t.scale);
    },
    [],
  );
  const tuftPos = useCallback(
    (t: { x: number; y: number; z: number }) => [t.x, t.y, t.z] as const,
    [],
  );

  if (!tufts.length) return null;
  // Grass tufts are transparent billboards — aggressive cull at 75m keeps
  // overdraw + alpha-test cost bounded when the camera drives away.
  return (
    <LodInstancedMesh
      instances={tufts}
      geom={geom}
      mat={mat}
      build={buildTuft}
      posOf={tuftPos}
      farDist={75}
      frustumCulled={false}
      intervalMs={120}
    />
  );
}
