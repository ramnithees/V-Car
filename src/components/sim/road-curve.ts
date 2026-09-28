import * as THREE from "three";
import type { PathSample } from "./store";

/**
 * Shared road centreline.
 *
 * Both the visible road ribbon (Road.tsx) and the terrain corridor
 * (terrain-height.ts) consume the SAME Catmull-Rom subdivided polyline and
 * the SAME per-station bank/heading values so they agree to machine
 * precision on any elevation / bank / curvature combination.
 *
 * World frame convention (matches the rest of the renderer):
 *   world_x = sim.x
 *   world_y = sim.z   (elevation)
 *   world_z = -sim.y
 */

export interface RoadStation {
  wx: number;
  wy: number;
  wz: number;
  /** cumulative arc-length in world XZ from station 0 */
  s: number;
  /** unit tangent in world XZ */
  tx: number;
  tz: number;
  /** unit outward-left normal in world XZ (perpendicular to tangent) */
  nx: number;
  nz: number;
  /** heading (atan2 -tz, tx) — matches Road.tsx original convention */
  heading: number;
  /** road bank angle, linearly interpolated between raw samples */
  bank: number;
}

export interface RoadCurve {
  /** subdivided polyline, N ≈ samples.length * 4 */
  stations: RoadStation[];
  /** raw source sample count */
  rawCount: number;
}

export function createRoadCurve(samples: PathSample[]): RoadCurve | null {
  const N = samples.length;
  if (N < 2) return null;

  // Catmull-Rom in sim (x, elev, y) — matches the renderer's Road ribbon.
  const raw = samples.map((s) => new THREE.Vector3(s.x, s.z, s.y));
  const curve = new THREE.CatmullRomCurve3(raw, false, "catmullrom", 0.5);
  const subCount = Math.max(N * 4, 240);
  const pts = curve.getPoints(subCount);

  const stations: RoadStation[] = new Array(pts.length);
  let sAcc = 0;

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const prv = pts[Math.max(i - 1, 0)];

    // Central-difference tangent in sim (x, y). Convert to world XZ where
    // world_x = sim.x, world_z = -sim.y.
    let dsx = nxt.x - prv.x;
    let dsy = nxt.z - prv.z; // sim y
    let len = Math.hypot(dsx, dsy);
    if (len < 1e-6) {
      dsx = nxt.x - cur.x;
      dsy = nxt.z - cur.z;
      len = Math.hypot(dsx, dsy) || 1;
    }
    // world tangent
    const tx = dsx / len;
    const tz = -dsy / len;
    // Outward-LEFT normal in world XZ — must match the ribbon convention in
    // Road.tsx, which offsets its "left" edge by (-dy, -dx) in world space
    // (i.e. the tangent rotated -90°). Using the opposite (+90°) normal here
    // flipped the sign of the banked-corridor lift, so on banked sections the
    // terrain rose on the side where the road drops and buried half the
    // asphalt. Keep this rotation identical to Road.tsx.
    const nx = tz;
    const nz = -tx;

    // Linear-interp bank between the two nearest raw samples.
    const f = (i / Math.max(1, pts.length - 1)) * (N - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(N - 1, i0 + 1);
    const t = f - i0;
    const bank = (samples[i0].bank_rad ?? 0) * (1 - t) + (samples[i1].bank_rad ?? 0) * t;

    const wx = cur.x;
    const wy = cur.y;
    const wz = -cur.z;

    if (i > 0) {
      const prev = stations[i - 1];
      sAcc = prev.s + Math.hypot(wx - prev.wx, wz - prev.wz);
    }

    stations[i] = {
      wx,
      wy,
      wz,
      s: sAcc,
      tx,
      tz,
      nx,
      nz,
      heading: Math.atan2(tz, tx),
      bank,
    };
  }

  return { stations, rawCount: N };
}
