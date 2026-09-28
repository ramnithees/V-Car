import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";

/**
 * Roadside kit: utility poles + power lines, signs, chevron boards,
 * distance markers, concrete Jersey barriers.
 * Everything anchored to the road spline; instanced where useful.
 */
export function RoadsideKit({ samples }: { samples: PathSample[] }) {
  const kit = useMemo(() => buildKit(samples), [samples]);
  if (!kit) return null;
  return (
    <group>
      <UtilityPoles poles={kit.poles} />
      <PowerLines poles={kit.poles} />
      <SpeedSigns signs={kit.speedSigns} />
      <ChevronBoards boards={kit.chevrons} />
      <DistanceMarkers markers={kit.markers} />
      <JerseyBarriers barriers={kit.jersey} />
    </group>
  );
}

interface Pole {
  x: number;
  y: number;
  z: number;
  heading: number;
  side: 1 | -1;
}
interface SignItem {
  x: number;
  y: number;
  z: number;
  heading: number;
  label: string;
}
interface ChevronItem {
  x: number;
  y: number;
  z: number;
  heading: number;
  side: 1 | -1;
}
interface JerseyItem {
  x: number;
  y: number;
  z: number;
  heading: number;
  side: 1 | -1;
}

function buildKit(samples: PathSample[]) {
  if (samples.length < 3) return null;
  const poles: Pole[] = [];
  const speedSigns: SignItem[] = [];
  const chevrons: ChevronItem[] = [];
  const markers: SignItem[] = [];
  const jersey: JerseyItem[] = [];

  // Compute per-sample curvature (finite difference of heading)
  const N = samples.length;
  const headings = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = Math.min(N - 1, i + 1);
    headings[i] = Math.atan2(samples[j].y - samples[i].y, samples[j].x - samples[i].x);
  }
  const wrap = (a: number) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  let distSinceMarker = 0;
  let distSinceJersey = 0;
  let prevX = samples[0].x,
    prevY = samples[0].y;
  let totalKm = 0;

  for (let i = 0; i < N; i++) {
    const cur = samples[i];
    const step = Math.hypot(cur.x - prevX, cur.y - prevY);
    totalKm += step / 1000;
    prevX = cur.x;
    prevY = cur.y;
    const heading = headings[i];
    const nx = -Math.sin(heading);
    const ny = Math.cos(heading);

    // Utility poles: every 60 m alternating sides
    if (i % 12 === 0) {
      const side: 1 | -1 = (Math.floor(i / 12) % 2 === 0 ? 1 : -1) as 1 | -1;
      const off = 9.5;
      poles.push({
        x: cur.x + side * nx * off,
        y: cur.z,
        z: -(cur.y + side * ny * off),
        heading,
        side,
      });
    }

    // Curvature-driven chevrons
    if (i > 2 && i < N - 2) {
      const dHead = Math.abs(wrap(headings[i + 1] - headings[i - 1]));
      if (dHead > 0.12 && i % 4 === 0) {
        const side: 1 | -1 = wrap(headings[i + 1] - headings[i - 1]) > 0 ? 1 : -1;
        const off = 7;
        chevrons.push({
          x: cur.x - side * nx * off,
          y: cur.z,
          z: -(cur.y - side * ny * off),
          heading,
          side,
        });
      }
    }

    // Distance markers every 500 m
    distSinceMarker += step;
    if (distSinceMarker >= 500) {
      distSinceMarker = 0;
      markers.push({
        x: cur.x + nx * 8,
        y: cur.z,
        z: -(cur.y + ny * 8),
        heading,
        label: `${totalKm.toFixed(1)}`,
      });
    }

    // Speed limit sign at start and every ~1000 m
    if (i === 4 || (i > 4 && i % 220 === 0)) {
      speedSigns.push({
        x: cur.x + nx * 8,
        y: cur.z,
        z: -(cur.y + ny * 8),
        heading,
        label: "120",
      });
    }

    // Jersey barriers only on nearly-straight, high-speed segments (low curvature)
    if (i > 2 && i < N - 2) {
      const dHead = Math.abs(wrap(headings[i + 1] - headings[i - 1]));
      distSinceJersey += step;
      if (dHead < 0.02 && distSinceJersey >= 3.5) {
        distSinceJersey = 0;
        const off = 5.6;
        jersey.push({
          x: cur.x + nx * off,
          y: cur.z,
          z: -(cur.y + ny * off),
          heading,
          side: 1,
        });
      }
    }
  }

  return { poles, speedSigns, chevrons, markers, jersey };
}

/* -------------------------------- Utility poles ---------------------------- */

function UtilityPoles({ poles }: { poles: Pole[] }) {
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.14, 0.18, 9, 8), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(2.4, 0.12, 0.12), []);
  const insGeom = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 0.2, 6), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6b5843", roughness: 0.95 }),
    [],
  );
  const armMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a3d2f", roughness: 0.9 }),
    [],
  );
  const insMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e6eaef", roughness: 0.4 }),
    [],
  );
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const insRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    poles.forEach((p, i) => {
      d.position.set(p.x, p.y + 4.5, p.z);
      d.rotation.set(0, -p.heading, 0);
      d.updateMatrix();
      poleRef.current?.setMatrixAt(i, d.matrix);
      d.position.set(p.x, p.y + 8.4, p.z);
      d.updateMatrix();
      armRef.current?.setMatrixAt(i, d.matrix);
      d.position.set(p.x, p.y + 8.55, p.z);
      d.updateMatrix();
      insRef.current?.setMatrixAt(i, d.matrix);
    });
    if (poleRef.current) poleRef.current.instanceMatrix.needsUpdate = true;
    if (armRef.current) armRef.current.instanceMatrix.needsUpdate = true;
    if (insRef.current) insRef.current.instanceMatrix.needsUpdate = true;
  }, [poles]);

  if (!poles.length) return null;
  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeom, poleMat, poles.length]} castShadow />
      <instancedMesh ref={armRef} args={[armGeom, armMat, poles.length]} castShadow />
      <instancedMesh ref={insRef} args={[insGeom, insMat, poles.length]} />
    </group>
  );
}

function PowerLines({ poles }: { poles: Pole[] }) {
  const geo = useMemo(() => {
    if (poles.length < 2) return null;
    const positions: number[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      // Only connect same-side poles; otherwise skip
      if (a.side !== b.side) continue;
      // Three parallel wires
      for (let w = -1; w <= 1; w++) {
        const ox = -Math.sin(a.heading) * w * 0.8;
        const oz = -Math.cos(a.heading) * w * 0.8;
        // Approximate catenary with 6 segments
        const segs = 6;
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs;
          const t1 = (k + 1) / segs;
          const sagK = (t: number) => -Math.sin(t * Math.PI) * 0.35;
          const x0 = a.x + (b.x - a.x) * t0 + ox;
          const z0 = a.z + (b.z - a.z) * t0 + oz;
          const y0 = a.y + 8.5 + (b.y - a.y) * t0 + sagK(t0);
          const x1 = a.x + (b.x - a.x) * t1 + ox;
          const z1 = a.z + (b.z - a.z) * t1 + oz;
          const y1 = a.y + 8.5 + (b.y - a.y) * t1 + sagK(t1);
          positions.push(x0, y0, z0, x1, y1, z1);
        }
      }
    }
    if (!positions.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [poles]);
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#1a1c20", transparent: true, opacity: 0.8 }),
    [],
  );
  if (!geo) return null;
  return <lineSegments args={[geo, mat]} />;
}

/* ---------------------------------- Signs --------------------------------- */

function makeSignTexture(label: string, color: string, textColor: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = textColor;
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function SpeedSigns({ signs }: { signs: SignItem[] }) {
  const tex = useMemo(() => makeSignTexture("120", "#ffffff", "#c8102e"), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 }),
    [tex],
  );
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.4, roughness: 0.6 }),
    [],
  );
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), []);
  const faceGeom = useMemo(() => new THREE.PlaneGeometry(0.9, 0.9), []);
  if (!signs.length) return null;
  return (
    <group>
      {signs.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} rotation={[0, -s.heading, 0]}>
          <mesh position={[0, 1.4, 0]} castShadow geometry={postGeom} material={postMat} />
          <mesh position={[0, 2.6, 0]} castShadow geometry={faceGeom} material={mat} />
        </group>
      ))}
    </group>
  );
}

function DistanceMarkers({ markers }: { markers: SignItem[] }) {
  const textureCache = useMemo(() => new Map<string, THREE.CanvasTexture>(), []);
  const getTex = (label: string) => {
    let t = textureCache.get(label);
    if (!t) {
      t = makeSignTexture(label, "#1a3d6e", "#ffffff");
      textureCache.set(label, t);
    }
    return t;
  };
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.4, roughness: 0.6 }),
    [],
  );
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), []);
  const faceGeom = useMemo(() => new THREE.PlaneGeometry(0.7, 0.5), []);
  const faceMats = useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    return (label: string) => {
      let m = cache.get(label);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          map: getTex(label),
          side: THREE.DoubleSide,
          roughness: 0.6,
        });
        cache.set(label, m);
      }
      return m;
    };
  }, [textureCache]);
  if (!markers.length) return null;
  return (
    <group>
      {markers.map((m, i) => (
        <group key={i} position={[m.x, m.y, m.z]} rotation={[0, -m.heading, 0]}>
          <mesh position={[0, 0.9, 0]} castShadow geometry={postGeom} material={postMat} />
          <mesh
            position={[0, 1.7, 0]}
            castShadow
            geometry={faceGeom}
            material={faceMats(m.label)}
          />
        </group>
      ))}
    </group>
  );
}

function ChevronBoards({ boards }: { boards: ChevronItem[] }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e6c22a";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#111417";
    ctx.beginPath();
    ctx.moveTo(20, 30);
    ctx.lineTo(70, 64);
    ctx.lineTo(20, 98);
    ctx.lineTo(40, 98);
    ctx.lineTo(90, 64);
    ctx.lineTo(40, 30);
    ctx.closePath();
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  if (!boards.length) return null;
  return (
    <group>
      {boards.map((b, i) => (
        <group
          key={i}
          position={[b.x, b.y, b.z]}
          rotation={[0, -b.heading + (b.side < 0 ? Math.PI : 0), 0]}
        >
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 1.8, 6]} />
            <meshStandardMaterial color="#c2c6cf" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <planeGeometry args={[0.9, 0.6]} />
            <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* --------------------------- Jersey barriers ------------------------------ */

function JerseyBarriers({ barriers }: { barriers: JerseyItem[] }) {
  const geom = useMemo(() => {
    // Simplified Jersey profile: trapezoid + narrow top, extruded 3m
    const shape = new THREE.Shape();
    shape.moveTo(-0.4, 0);
    shape.lineTo(0.4, 0);
    shape.lineTo(0.28, 0.25);
    shape.lineTo(0.12, 0.5);
    shape.lineTo(0.12, 0.85);
    shape.lineTo(-0.12, 0.85);
    shape.lineTo(-0.12, 0.5);
    shape.lineTo(-0.28, 0.25);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 3,
      bevelEnabled: false,
    });
    g.translate(0, 0, -1.5);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#dcdfe4", roughness: 0.9 }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    barriers.forEach((b, i) => {
      d.position.set(b.x, b.y, b.z);
      d.rotation.set(0, -b.heading, 0);
      d.updateMatrix();
      ref.current?.setMatrixAt(i, d.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [barriers]);
  if (!barriers.length) return null;
  return <instancedMesh ref={ref} args={[geom, mat, barriers.length]} castShadow receiveShadow />;
}
