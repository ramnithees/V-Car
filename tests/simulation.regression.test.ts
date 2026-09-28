import { describe, it, expect } from "vitest";
import { runSimulation } from "@/lib/physics/simulation";
import { TEST_VEHICLE, roadStraight, roadCurved, roadMixed } from "./fixtures";

/**
 * Regression suite — physics simulation traces.
 * Verifies station-by-station output is well-formed for straight, curved,
 * and mixed tracks across multiple lengths.
 */

const LENGTHS = [100, 500, 1500];

const finite = (n: number) => Number.isFinite(n);

describe.each(LENGTHS)("simulation trace — length=%dm", (L) => {
  const scenarios = [
    ["straight", roadStraight(L)],
    ["curved", roadCurved(L)],
    ["mixed", roadMixed(L)],
  ] as const;

  for (const [name, road] of scenarios) {
    describe(name, () => {
      const res = runSimulation(TEST_VEHICLE, road, { step_m: 5 });
      const s = res.samples;

      it("produces samples covering the track", () => {
        expect(s.length).toBeGreaterThan(1);
        expect(s[0].s_m).toBe(0);
        expect(s[s.length - 1].s_m).toBeGreaterThanOrEqual(L - 5);
      });

      it("every sample has finite state", () => {
        for (const p of s) {
          for (const k of [
            "x",
            "y",
            "z",
            "heading_rad",
            "speed_mps",
            "lat_accel",
            "long_accel",
            "steering_deg",
            "t_s",
          ] as const) {
            expect(finite(p[k]), `${k} at idx ${p.idx}`).toBe(true);
          }
        }
      });

      it("station and time are monotonic", () => {
        for (let i = 1; i < s.length; i++) {
          expect(s[i].s_m).toBeGreaterThanOrEqual(s[i - 1].s_m);
          expect(s[i].t_s).toBeGreaterThanOrEqual(s[i - 1].t_s - 1e-9);
        }
      });

      it("step-to-step position delta stays near the integrator step (≤ 6m)", () => {
        for (let i = 1; i < s.length; i++) {
          const dx = s[i].x - s[i - 1].x;
          const dy = s[i].y - s[i - 1].y;
          const d = Math.hypot(dx, dy);
          expect(d, `gap at idx ${i}`).toBeLessThan(6);
        }
      });

      it("heading changes are bounded and unwrappable (no discontinuity)", () => {
        for (let i = 1; i < s.length; i++) {
          let dh = s[i].heading_rad - s[i - 1].heading_rad;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          // 5m step with min radius ~80m → dθ ≤ 0.0625 rad
          expect(Math.abs(dh)).toBeLessThan(0.1);
        }
      });

      it("safety score in [0,100]", () => {
        for (const p of s) {
          expect(p.safety_score).toBeGreaterThanOrEqual(0);
          expect(p.safety_score).toBeLessThanOrEqual(100);
        }
      });
    });
  }
});

describe("straight tracks stay straight", () => {
  for (const L of LENGTHS) {
    it(`length=${L}m — lateral drift < 1e-6 m`, () => {
      const { samples } = runSimulation(TEST_VEHICLE, roadStraight(L), { step_m: 5 });
      for (const p of samples) {
        expect(Math.abs(p.y)).toBeLessThan(1e-6);
        expect(Math.abs(p.heading_rad)).toBeLessThan(1e-9);
        expect(p.steering_deg).toBe(0);
      }
    });
  }
});
