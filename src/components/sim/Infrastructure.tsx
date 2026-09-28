import { useMemo } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";
import type { TerrainSampler } from "./terrain-height";

/**
 * Bridges and tunnels — spline-classified, decorative only.
 *
 * Scans the road samples once and looks at the difference between the road
 * elevation (sample.z) and the local pure-hill terrain height at the road's
 * world XZ position (sampler.hillOnly). Contiguous samples where:
 *
 *   hillOnly(road) < road_elev - 4  → BRIDGE span
 *   hillOnly(road) > road_elev + 3  → TUNNEL span
 *
 * The car keeps following the spline; these structures have no collision.
 */

interface Span {
  from: number;
  to: number;
}

function collectSpans(
  samples: PathSample[],
  classify: (i: number) => boolean,
  minLength = 8,
): Span[] {
  const spans: Span[] = [];
  let start = -1;
  for (let i = 0; i < samples.length; i++) {
    if (classify(i)) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start >= 3) spans.push({ from: start, to: i - 1 });
      start = -1;
    }
  }
  if (start !== -1 && samples.length - 1 - start >= 3) {
    spans.push({ from: start, to: samples.length - 1 });
  }
  // Convert index-based length threshold via sample spacing (~4-5m typical)
  return spans.filter((s) => {
    const a = samples[s.from];
    const b = samples[s.to];
    return Math.hypot(b.x - a.x, b.y - a.y) >= minLength;
  });
}

export function Infrastructure({
  samples,
  sampler,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
}) {
  const { bridges, tunnels } = useMemo(() => {
    if (samples.length < 4) return { bridges: [] as Span[], tunnels: [] as Span[] };
    const isBridge = (i: number) => {
      const s = samples[i];
      const h = sampler.hillOnly(s.x, -s.y);
      return h < s.z - 4;
    };
    const isTunnel = (i: number) => {
      const s = samples[i];
      const h = sampler.hillOnly(s.x, -s.y);
      return h > s.z + 3;
    };
    return {
      bridges: collectSpans(samples, isBridge, 12),
      tunnels: collectSpans(samples, isTunnel, 10),
    };
  }, [samples, sampler]);

  if (bridges.length === 0 && tunnels.length === 0) return null;
  return (
    <group>
      {bridges.map((s, i) => (
        <Bridge key={`b${i}`} samples={samples} sampler={sampler} span={s} />
      ))}
      {tunnels.map((s, i) => (
        <Tunnel key={`t${i}`} samples={samples} sampler={sampler} span={s} />
      ))}
    </group>
  );
}

/* ------------------------------- Bridge ---------------------------------- */

function Bridge({
  samples,
  sampler,
  span,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
  span: Span;
}) {
  const built = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = span.from; i <= span.to; i++) {
      const s = samples[i];
      pts.push(new THREE.Vector3(s.x, s.z, -s.y));
    }
    return { pts };
  }, [samples, span]);

  // Piers every ~15 m along span
  const piers: Array<{ x: number; z: number; top: number; groundY: number }> = [];
  for (let i = 0; i < built.pts.length; i += 4) {
    const p = built.pts[i];
    const groundY = sampler.hillOnly(p.x, p.z);
    if (p.y - groundY > 3) {
      piers.push({ x: p.x, z: p.z, top: p.y - 0.6, groundY });
    }
  }

  const width = 12; // deck side-to-side (must be > road width)
  return (
    <group>
      {/* Deck sides (parapet walls) as extruded strips along the spline */}
      <DeckSide pts={built.pts} width={width} height={0.9} color="#c3c5c8" side={1} />
      <DeckSide pts={built.pts} width={width} height={0.9} color="#c3c5c8" side={-1} />
      {/* Deck underside slab (thin, sits below road surface) */}
      <DeckUnderside pts={built.pts} width={width} />
      {/* Piers */}
      {piers.map((p, i) => (
        <group key={i} position={[p.x, (p.top + p.groundY) / 2, p.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.2, p.top - p.groundY, 2.2]} />
            <meshStandardMaterial color="#8a8d92" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DeckSide({
  pts,
  width,
  height,
  color,
  side,
}: {
  pts: THREE.Vector3[];
  width: number;
  height: number;
  color: string;
  side: 1 | -1;
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const ox = nx * (width / 2) * side;
      const oz = nz * (width / 2) * side;
      // Bottom then top vertex
      verts.push(p.x + ox, p.y - 0.2, p.z + oz);
      verts.push(p.x + ox, p.y + height, p.z + oz);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [pts, width, height, side]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }),
    [color],
  );
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}

function DeckUnderside({ pts, width }: { pts: THREE.Vector3[]; width: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      verts.push(p.x + nx * (width / 2), p.y - 0.4, p.z + nz * (width / 2));
      verts.push(p.x - nx * (width / 2), p.y - 0.4, p.z - nz * (width / 2));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [pts, width]);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6a6d72",
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    [],
  );
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

/* ------------------------------- Tunnel ---------------------------------- */

function Tunnel({
  samples,
  sampler: _sampler,
  span,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
  span: Span;
}) {
  const geo = useMemo(() => {
    // Build a semi-tube along the road span with a small hood at each end.
    const pts: THREE.Vector3[] = [];
    for (let i = span.from; i <= span.to; i++) {
      const s = samples[i];
      pts.push(new THREE.Vector3(s.x, s.z, -s.y));
    }
    const W = 6; // half-width
    const H = 5.2; // ceiling height above road
    const RINGS = 12; // arc subdivisions
    const g = new THREE.BufferGeometry();
    const verts: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      for (let r = 0; r <= RINGS; r++) {
        // Arc from -W to +W across the top (semicircle), y = H at apex
        const t = r / RINGS; // 0..1
        const ang = Math.PI * (1 - t); // π..0
        const rx = -Math.cos(ang) * W; // -W..+W
        const ry = Math.sin(ang) * H; // 0..H..0
        verts.push(p.x + nx * rx, p.y + ry, p.z + nz * rx);
      }
    }
    const stride = RINGS + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let r = 0; r < RINGS; r++) {
        const a = i * stride + r;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // Inside-facing: reversed winding
        indices.push(a, c, b, b, c, d);
      }
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [samples, span]);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d0d3d8",
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.BackSide,
      }),
    [],
  );

  // Portal frames at start and end
  const portals = useMemo(() => {
    const a = samples[span.from];
    const b = samples[span.to];
    const aNext = samples[Math.min(samples.length - 1, span.from + 1)];
    const bPrev = samples[Math.max(0, span.to - 1)];
    const headA = Math.atan2(aNext.y - a.y, aNext.x - a.x);
    const headB = Math.atan2(b.y - bPrev.y, b.x - bPrev.x);
    return [
      { x: a.x, y: a.z, z: -a.y, rot: -headA },
      { x: b.x, y: b.z, z: -b.y, rot: -headB },
    ];
  }, [samples, span]);

  // Interior strip lights along ceiling
  const lightPos: THREE.Vector3[] = [];
  for (let i = span.from + 2; i <= span.to - 2; i += 3) {
    const s = samples[i];
    lightPos.push(new THREE.Vector3(s.x, s.z + 5.0, -s.y));
  }

  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow />
      {portals.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]}>
          {/* Rectangular concrete facade with arched cutout */}
          <mesh position={[0, 3.2, 0]} castShadow>
            <boxGeometry args={[16, 8, 0.8]} />
            <meshStandardMaterial color="#a8abb0" roughness={0.9} />
          </mesh>
          {/* Portal signage */}
          <mesh position={[0, 6.6, 0.42]}>
            <planeGeometry args={[10, 0.8]} />
            <meshStandardMaterial color="#1a3d6e" emissive="#1a3d6e" emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}
      {lightPos.map((v, i) => (
        <mesh key={i} position={[v.x, v.y, v.z]}>
          <boxGeometry args={[0.15, 0.08, 1.4]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffe8b0" emissiveIntensity={1.4} />
        </mesh>
      ))}
    </group>
  );
}
