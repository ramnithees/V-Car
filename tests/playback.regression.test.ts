import { describe, it, expect } from "vitest";
import { runSimulation } from "@/lib/physics/simulation";
import { sampleAt, worldFromSample, type PathSample } from "@/components/sim/store";
import { TEST_VEHICLE, roadStraight, roadCurved, roadMixed } from "./fixtures";

/**
 * Playback regression — verifies the interpolator (sampleAt) and world
 * transform (worldFromSample) produce jitter-free vehicle transforms and
 * stable chase-camera positions across straight & curved tracks at multiple
 * playback lengths.
 */

const toPath = (samples: ReturnType<typeof runSimulation>["samples"]): PathSample[] =>
  samples.map((s) => ({
    idx: s.idx,
    s_m: s.s_m,
    t_s: s.t_s,
    x: s.x,
    y: s.y,
    z: s.z,
    heading_rad: s.heading_rad,
    speed_mps: s.speed_mps,
    lat_accel: s.lat_accel,
    long_accel: s.long_accel,
    steering_deg: s.steering_deg,
    fuel_rate_lps: s.fuel_rate_lps,
    safety_score: s.safety_score,
    radius_m: s.radius_m,
  }));

// Chase camera model — mirrors src/components/sim/Cameras.tsx target
// (behind the car along -forward, lifted by camY). Compared frame-to-frame
// for stability, not for exact match with the R3F component.
function chaseTarget(w: ReturnType<typeof worldFromSample>, dist = 8, height = 3) {
  const [px, py, pz] = w.position;
  const [fx, , fz] = w.forward;
  return [px - fx * dist, py + height, pz - fz * dist] as [number, number, number];
}

const LENGTHS = [100, 500, 1500];
const TRACKS = [
  ["straight", roadStraight],
  ["curved", roadCurved],
  ["mixed", roadMixed],
] as const;

// steps per second of virtual playback (240 = well above render rate)
const PLAYBACK_STEPS = 240;

describe.each(LENGTHS)("playback jitter — length=%dm", (L) => {
  for (const [name, mk] of TRACKS) {
    describe(name, () => {
      const sim = runSimulation(TEST_VEHICLE, mk(L), { step_m: 5 });
      const path = toPath(sim.samples);

      const frames: {
        pos: [number, number, number];
        yaw: number;
        cam: [number, number, number];
      }[] = [];
      for (let i = 0; i <= PLAYBACK_STEPS; i++) {
        const p = i / PLAYBACK_STEPS;
        const s = sampleAt(path, p);
        expect(s, `sampleAt @ ${p}`).not.toBeNull();
        const w = worldFromSample(s!);
        frames.push({ pos: w.position, yaw: w.yaw, cam: chaseTarget(w) });
      }

      it("vehicle position is continuous (no teleport)", () => {
        // per-frame budget: 1.5× the mean expected step, floor 0.5m for very short tracks
        const expectedStep = Math.max(0.5, (L / PLAYBACK_STEPS) * 1.5);
        for (let i = 1; i < frames.length; i++) {
          const [ax, ay, az] = frames[i - 1].pos;
          const [bx, by, bz] = frames[i].pos;
          const d = Math.hypot(bx - ax, by - ay, bz - az);
          expect(d, `pos jump ${d.toFixed(3)}m at frame ${i}`).toBeLessThan(expectedStep + 0.05);
        }
      });

      it("yaw is continuous and wrap-safe", () => {
        // physical bound: dθ ≤ step_m / min_radius; +25% slack for interp overshoot
        const minRadius = name === "mixed" ? 80 : name === "curved" ? 120 : 1e9;
        const stepM = L / PLAYBACK_STEPS;
        const limit = Math.max(0.02, (stepM / minRadius) * 1.25 + 0.01);
        for (let i = 1; i < frames.length; i++) {
          let dy = frames[i].yaw - frames[i - 1].yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          expect(Math.abs(dy), `yaw jump at frame ${i}`).toBeLessThan(limit);
        }
      });

      it("chase camera never jitters or teleports", () => {
        // camera should move at ~same rate as vehicle
        const expectedStep = Math.max(0.6, (L / PLAYBACK_STEPS) * 1.7);
        for (let i = 1; i < frames.length; i++) {
          const [ax, ay, az] = frames[i - 1].cam;
          const [bx, by, bz] = frames[i].cam;
          const d = Math.hypot(bx - ax, by - ay, bz - az);
          expect(d, `cam jump ${d.toFixed(3)}m at frame ${i}`).toBeLessThan(expectedStep + 0.1);
        }
      });

      it("vehicle progresses monotonically along the path", () => {
        // cumulative XZ travel should never decrease more than a hair
        for (let i = 1; i < frames.length; i++) {
          const [ax, , az] = frames[i - 1].pos;
          const [bx, , bz] = frames[i].pos;
          // dot with local forward should be non-negative (moving forward)
          const fwd = worldFromSample(sampleAt(path, i / PLAYBACK_STEPS)!).forward;
          const dot = (bx - ax) * fwd[0] + (bz - az) * fwd[2];
          expect(dot).toBeGreaterThan(-0.01);
        }
      });
    });
  }
});

describe("straight track — zero-jitter guarantees", () => {
  for (const L of LENGTHS) {
    it(`length=${L}m — yaw is constant, y-lateral is zero`, () => {
      const sim = runSimulation(TEST_VEHICLE, roadStraight(L), { step_m: 5 });
      const path = toPath(sim.samples);
      const yaws: number[] = [];
      for (let i = 0; i <= 120; i++) {
        const w = worldFromSample(sampleAt(path, i / 120)!);
        yaws.push(w.yaw);
        expect(Math.abs(w.position[2])).toBeLessThan(1e-6); // world z = -y_sim
      }
      const y0 = yaws[0];
      for (const y of yaws) expect(Math.abs(y - y0)).toBeLessThan(1e-9);
    });
  }
});

describe("worldFromSample orientation invariants", () => {
  it("forward and right are unit-length and orthogonal", () => {
    const sim = runSimulation(TEST_VEHICLE, roadMixed(600), { step_m: 5 });
    const path = toPath(sim.samples);
    for (let i = 0; i <= 100; i++) {
      const w = worldFromSample(sampleAt(path, i / 100)!);
      const [fx, , fz] = w.forward;
      const [rx, , rz] = w.right;
      expect(Math.hypot(fx, fz)).toBeCloseTo(1, 9);
      expect(Math.hypot(rx, rz)).toBeCloseTo(1, 9);
      expect(Math.abs(fx * rx + fz * rz)).toBeLessThan(1e-9);
    }
  });
});
