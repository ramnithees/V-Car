import type { PathSample } from "./store";
import { hash2 } from "./textures";
import type { TerrainSampler } from "./terrain-height";

/**
 * Pure placement engine — single source of truth for where environment
 * props (trees, bushes, grass, rocks, ponds) are scattered.
 *
 * Extracted from the R3F components so the regression suite can assert the
 * Phase 3/7 corridor rules without rendering:
 *
 *   Protected corridor  : 10 m flat roadbed either side of centreline.
 *   Every scattered prop is verified against `sampler.roadDistance` AFTER
 *   jitter is applied — candidates that fall inside their clearance floor
 *   are dropped, so no hash/curve combination can ever intrude.
 */
export const CLEARANCE = {
  /** Trees: nominal offset 20–80 m; floor guards jitter + curve effects. */
  tree: 15,
  /** Bushes: nominal offset 14–22 m. */
  bush: 12,
  /** Grass: nominal offset 12–34 m; floor sits at the corridor edge. */
  grass: 10,
  /** Rocks (Landscape): cluster scatter, corridor + safety margin. */
  rock: 15,
  /** Ponds (Landscape): valleys far from the road. */
  pond: 90,
} as const;

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  species: 0 | 1 | 2;
}
export interface BushInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}
export interface GrassTuftInstance {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}
export interface RockInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}
export interface PondInstance {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Trees + bushes. Deterministic given the same samples + sampler. */
export function computeVegetation(
  samples: PathSample[],
  sampler: TerrainSampler,
): { trees: TreeInstance[]; bushes: BushInstance[] } {
  const treeArr: TreeInstance[] = [];
  const bushArr: BushInstance[] = [];
  if (!samples.length) return { trees: treeArr, bushes: bushArr };

  for (let i = 0; i < samples.length; i += 4) {
    const cur = samples[i];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const dx = next.x - cur.x,
      dy = next.y - cur.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    for (let side = -1; side <= 1; side += 2) {
      // Trees: keep clear of the 10 m protected corridor + safety margin so
      // canopies never overhang the shoulder. Nominal range 20–80 m.
      for (let k = 0; k < 4; k++) {
        const off = 20 + hash2(i * 7 + k * 3 + side, k) * 60;
        const jitterS = 0.7 + hash2(i * 3 + k, side * 11) * 1.1;
        const jitter = (hash2(i + k * 2, side * 3) - 0.5) * 6;
        const jx = cur.x + side * nx * off + jitter;
        const jy = cur.y + side * ny * off + jitter;
        const worldX = jx,
          worldZ = -jy;
        // Corridor guard: drop any candidate that jitter/curvature pulled in.
        if (sampler.roadDistance(worldX, worldZ) < CLEARANCE.tree) continue;
        const groundY = sampler.heightAt(worldX, worldZ);
        const species = Math.floor(hash2(i * 13 + k, side) * 3) as 0 | 1 | 2;
        treeArr.push({
          x: worldX,
          y: groundY,
          z: worldZ,
          scale: jitterS,
          rot: hash2(i + k * 5, 7) * Math.PI * 2,
          species,
        });
      }
      // Bushes: outside corridor + ≥2 m clearance per Phase 7. Range 14–22 m.
      for (let b = 0; b < 3; b++) {
        const off = 14 + hash2(i * 5 + b, side * 2) * 8;
        const jx = cur.x + side * nx * off + (hash2(i + b, 2) - 0.5) * 2;
        const jy = cur.y + side * ny * off + (hash2(i - b, 3) - 0.5) * 2;
        const worldX = jx,
          worldZ = -jy;
        if (sampler.roadDistance(worldX, worldZ) < CLEARANCE.bush) continue;
        const groundY = sampler.heightAt(worldX, worldZ);
        bushArr.push({
          x: worldX,
          y: groundY,
          z: worldZ,
          scale: 0.4 + hash2(i, b) * 0.6,
          rot: hash2(i + b, 9) * Math.PI * 2,
        });
      }
    }
  }
  return { trees: treeArr, bushes: bushArr };
}

/** Grass tufts. Deterministic given the same samples + sampler. */
export function computeGrassTufts(
  samples: PathSample[],
  sampler: TerrainSampler,
): GrassTuftInstance[] {
  const arr: GrassTuftInstance[] = [];
  if (!samples.length) return arr;
  for (let i = 0; i < samples.length; i += 2) {
    const cur = samples[i];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const dx = next.x - cur.x,
      dy = next.y - cur.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 6; k++) {
        // Grass tufts sit entirely outside the 10 m protected corridor.
        const off = 12 + hash2(i * 5 + k, side * 3) * 22;
        const jx = cur.x + side * nx * off + (hash2(i + k, side) - 0.5) * 3;
        const jy = cur.y + side * ny * off + (hash2(i - k, side) - 0.5) * 3;
        const worldX = jx,
          worldZ = -jy;
        if (sampler.roadDistance(worldX, worldZ) < CLEARANCE.grass) continue;
        arr.push({
          x: worldX,
          z: worldZ,
          y: sampler.heightAt(worldX, worldZ),
          rot: hash2(i + k, 11) * Math.PI * 2,
          scale: 0.6 + hash2(i + k, 5) * 0.9,
        });
      }
    }
  }
  return arr;
}

/** Rocks + ponds (Landscape enrichment). Deterministic. */
export function computeLandscape(
  samples: PathSample[],
  sampler: TerrainSampler,
): { rocks: RockInstance[]; ponds: PondInstance[] } {
  const rocksArr: RockInstance[] = [];
  const pondsArr: PondInstance[] = [];
  if (!samples.length) return { rocks: rocksArr, ponds: pondsArr };

  // Scatter rocks around the road, biased into small clusters
  for (let i = 0; i < samples.length; i += 8) {
    const cur = samples[i];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const dx = next.x - cur.x,
      dy = next.y - cur.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;

    for (let side = -1; side <= 1; side += 2) {
      const cluster = hash2(i, side);
      if (cluster < 0.55) continue; // Sparse
      const off = 80 + hash2(i * 3, side * 5) * 180;
      const jx = cur.x + side * nx * off;
      const jy = cur.y + side * ny * off;
      // 3-5 rocks per cluster
      const count = 3 + Math.floor(hash2(i * 7, side * 11) * 3);
      for (let k = 0; k < count; k++) {
        const rx = jx + (hash2(i + k, side * 13) - 0.5) * 8;
        const rz = -(jy + (hash2(i - k, side * 17) - 0.5) * 8);
        // Corridor guard: never inside the road safety margin.
        if (sampler.roadDistance(rx, rz) < CLEARANCE.rock) continue;
        const groundY = sampler.heightAt(rx, rz);
        rocksArr.push({
          x: rx,
          y: groundY,
          z: rz,
          scale: 0.7 + hash2(i * k + 3, k) * 1.6,
          rot: hash2(i * 5 + k, 7) * Math.PI * 2,
        });
      }
    }
  }

  // A couple of ponds at terrain minima far from the road
  const attempts = 8;
  for (let a = 0; a < attempts; a++) {
    const seedI = Math.floor((a / attempts) * samples.length);
    const cur = samples[seedI];
    const next = samples[Math.min(samples.length - 1, seedI + 1)];
    const dx = next.x - cur.x,
      dy = next.y - cur.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    const side = a % 2 === 0 ? 1 : -1;
    const off = 160 + hash2(a, seedI) * 90;
    const px = cur.x + side * nx * off;
    const py = cur.y + side * ny * off;
    const wx = px,
      wz = -py;
    // Only accept where road is far (safety) and hills are low (valley)
    if (sampler.roadDistance(wx, wz) < CLEARANCE.pond) continue;
    const y = sampler.heightAt(wx, wz);
    // Ponds only in relatively low valleys
    if (y > -2) continue;
    pondsArr.push({ x: wx, y, z: wz, radius: 8 + hash2(a * 3, seedI) * 10 });
    if (pondsArr.length >= 3) break;
  }

  return { rocks: rocksArr, ponds: pondsArr };
}
