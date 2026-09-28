import type { PathSample } from "./store";
import { fbm } from "./textures";
import { createRoadCurve, type RoadCurve } from "./road-curve";

/**
 * Terrain height field — single source of truth for both the terrain surface
 * and every ground-placed object.
 *
 * Design (matches S3/S4 of the driving-sim road corridor spec):
 *
 *   |—— asphalt ——|— buffer —|————— blend ————————|————— hills ————————|
 *   0          SHOULDER   +BUFFER            +EMBANK              +VIEW_RING
 *
 *   1. Inside SHOULDER+BUFFER  → exact road plane (banked). No fbm noise.
 *      Guarantees the corridor is fully protected: no terrain ever pokes
 *      through, no seam under the asphalt.
 *   2. SHOULDER+BUFFER → +EMBANK  → smoothstep blend from road plane to the
 *      view-capped hills. Cross-section is continuous C1-ish.
 *   3. Beyond blend, inside VIEW_RING → hills are soft-capped BELOW road
 *      elevation so mountains never cover the road from side / drone /
 *      chase cameras. Also gently supported so elevated roads don't float
 *      on a cliff.
 *   4. Beyond VIEW_RING → natural hills return; view cap smoothly released.
 *
 * Coordinate convention:
 *   Sim frame:   (s.x, s.y, s.z)  z = elevation
 *   World frame: (s.x, s.z, -s.y)
 */

const SHOULDER = 6.0; // metres — flat asphalt+shoulder half-width
const BUFFER = 4.0; // metres — flat safety buffer past shoulder
const EMBANK = 60.0; // metres — smoothstep blend width
const VIEW_RING = 260.0; // metres — hills soft-capped inside this ring
const VIEW_DROP = 7.0; // metres — hills stay ≥ VIEW_DROP below road
const SUPPORT_FALLOFF = 90.0; // metres — embankment support decay
const SUPPORT_DROP = 12.0; // metres — how far below road support-floor sits
const HILL_AMPL = 22.0;
const CELL = 18.0; // spatial grid cell size

const CORRIDOR = SHOULDER + BUFFER;
const REACH = CORRIDOR + EMBANK;

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  sizeX: number;
  sizeZ: number;
}

export interface TerrainSampler {
  bounds: TerrainBounds;
  heightAt(worldX: number, worldZ: number): number;
  roadDistance(worldX: number, worldZ: number): number;
  hillOnly(worldX: number, worldZ: number): number;
  curve: RoadCurve | null;
}

/** Pure hill height (no road influence). Used only for far horizon. */
export function hillHeight(wx: number, wz: number): number {
  return (
    (fbm(wx * 0.006, wz * 0.006, 4) - 0.5) * HILL_AMPL +
    (fbm(wx * 0.02 + 10, wz * 0.02 - 3, 3) - 0.5) * 3.5
  );
}

function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Smooth min — softly saturates `a` toward `cap` when it exceeds cap. */
function softCap(a: number, cap: number, k = 4.0): number {
  const over = a - cap;
  if (over <= 0) return a;
  return cap + (over * k) / (over + k);
}

/** Smooth max — softly lifts `a` toward `floor` when it dips below. */
function softFloor(a: number, floor: number, k = 4.0): number {
  const under = floor - a;
  if (under <= 0) return a;
  return floor - (under * k) / (under + k);
}

interface RoadInfo {
  dist: number;
  lateral: number;
  elev: number;
  bank: number;
}

export function createTerrainSampler(samples: PathSample[], pad = 320): TerrainSampler {
  const curve = createRoadCurve(samples);

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  if (curve) {
    for (const st of curve.stations) {
      if (st.wx < minX) minX = st.wx;
      if (st.wx > maxX) maxX = st.wx;
      if (st.wz < minZ) minZ = st.wz;
      if (st.wz > maxZ) maxZ = st.wz;
    }
  }
  if (!isFinite(minX)) {
    minX = -pad;
    maxX = pad;
    minZ = -pad;
    maxZ = pad;
  }

  const gMinX = minX - VIEW_RING - 4;
  const gMaxX = maxX + VIEW_RING + 4;
  const gMinZ = minZ - VIEW_RING - 4;
  const gMaxZ = maxZ + VIEW_RING + 4;
  const cols = Math.max(1, Math.ceil((gMaxX - gMinX) / CELL));
  const rows = Math.max(1, Math.ceil((gMaxZ - gMinZ) / CELL));
  const grid: number[][] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) grid[i] = [];

  if (curve) {
    const stations = curve.stations;
    // Bucket each segment into every cell it can influence (up to VIEW_RING).
    const R = VIEW_RING;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      const sMinX = Math.min(a.wx, b.wx) - R,
        sMaxX = Math.max(a.wx, b.wx) + R;
      const sMinZ = Math.min(a.wz, b.wz) - R,
        sMaxZ = Math.max(a.wz, b.wz) + R;
      const c0 = Math.max(0, Math.floor((sMinX - gMinX) / CELL));
      const c1 = Math.min(cols - 1, Math.floor((sMaxX - gMinX) / CELL));
      const r0 = Math.max(0, Math.floor((sMinZ - gMinZ) / CELL));
      const r1 = Math.min(rows - 1, Math.floor((sMaxZ - gMinZ) / CELL));
      for (let r = r0; r <= r1; r++) {
        const rowOff = r * cols;
        for (let c = c0; c <= c1; c++) grid[rowOff + c].push(i);
      }
    }
  }

  const NO_ROAD: RoadInfo = { dist: Infinity, lateral: 0, elev: 0, bank: 0 };

  function roadInfo(qx: number, qz: number): RoadInfo {
    if (!curve) return NO_ROAD;
    if (qx < gMinX || qx > gMaxX || qz < gMinZ || qz > gMaxZ) return NO_ROAD;
    const c = Math.min(cols - 1, Math.max(0, Math.floor((qx - gMinX) / CELL)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((qz - gMinZ) / CELL)));
    const cell = grid[r * cols + c];
    if (cell.length === 0) return NO_ROAD;

    const stations = curve.stations;
    let bestD2 = Infinity;
    let bestT = 0;
    let bestI = -1;
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      const a = stations[i];
      const b = stations[i + 1];
      const dx = b.wx - a.wx;
      const dz = b.wz - a.wz;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 1e-6 ? ((qx - a.wx) * dx + (qz - a.wz) * dz) / L2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = a.wx + dx * t;
      const pz = a.wz + dz * t;
      const ex = qx - px;
      const ez = qz - pz;
      const d2 = ex * ex + ez * ez;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestT = t;
        bestI = i;
      }
    }
    if (bestI < 0) return NO_ROAD;
    const a = stations[bestI];
    const b = stations[bestI + 1];
    const px = a.wx + (b.wx - a.wx) * bestT;
    const pz = a.wz + (b.wz - a.wz) * bestT;
    const elev = a.wy + (b.wy - a.wy) * bestT;
    const bank = a.bank + (b.bank - a.bank) * bestT;
    let nx = a.nx + (b.nx - a.nx) * bestT;
    let nz = a.nz + (b.nz - a.nz) * bestT;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const ex = qx - px;
    const ez = qz - pz;
    const lateral = ex * nx + ez * nz;
    return { dist: Math.sqrt(bestD2), lateral, elev, bank };
  }

  /**
   * View-protected hill: raw fbm, then soft-capped below road elev inside
   * VIEW_RING (so mountains never cover the road) and softly lifted toward
   * an embankment support floor near the road (so elevated roads don't sit
   * on a cliff). Cap and floor both smoothly release with distance.
   */
  function viewCappedHill(qx: number, qz: number, info: RoadInfo): number {
    const base = hillHeight(qx, qz);
    if (!isFinite(info.dist)) return base;

    // Support region: near road, terrain floor rises toward road elev.
    const supportW = Math.exp(-Math.max(0, info.dist - REACH) / SUPPORT_FALLOFF);
    const supportFloor = info.elev - SUPPORT_DROP;
    let h = softFloor(base, supportFloor * supportW + base * (1 - supportW));

    // View-cap region: inside VIEW_RING, hills soft-capped below road elev.
    // Cap value rises with distance so at VIEW_RING it matches natural hills.
    const d = info.dist;
    if (d < VIEW_RING) {
      const release = smoothstep01((d - REACH) / (VIEW_RING - REACH));
      const cap = info.elev - VIEW_DROP + release * (HILL_AMPL + VIEW_DROP);
      h = softCap(h, cap, 3.0);
    }
    return h;
  }

  function heightAt(x: number, z: number): number {
    const info = roadInfo(x, z);
    if (info.dist >= VIEW_RING) return hillHeight(x, z);
    // Banked road plane at query point (embed lateral tilt).
    const roadPlane = info.elev + info.lateral * Math.sin(info.bank) - 0.05;
    if (info.dist <= CORRIDOR) return roadPlane;
    if (info.dist >= REACH) return viewCappedHill(x, z, info);
    const t = smoothstep01((info.dist - CORRIDOR) / EMBANK);
    const hill = viewCappedHill(x, z, info);
    return roadPlane * (1 - t) + hill * t;
  }

  function roadDistance(x: number, z: number): number {
    return roadInfo(x, z).dist;
  }

  return {
    bounds: {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      sizeX: maxX - minX + pad * 2,
      sizeZ: maxZ - minZ + pad * 2,
    },
    heightAt,
    roadDistance,
    hillOnly: hillHeight,
    curve,
  };
}
