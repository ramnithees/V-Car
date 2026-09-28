import { describe, it, expect } from "vitest";
import {
  gearFromRpm,
  engineRpmFromWheel,
  brakeGlowIntensity,
  indicatorPhase,
  thermalStep,
  CAMERA_ANCHORS,
} from "@/components/sim/vehicle/helpers";

describe("vehicle helpers", () => {
  it("gearFromRpm — monotonic bands", () => {
    expect(gearFromRpm(0, 0)).toBe(0);
    expect(gearFromRpm(0, 1)).toBe(1);
    expect(gearFromRpm(100, 0.5)).toBe(1);
    expect(gearFromRpm(200, 0.5)).toBe(2);
    expect(gearFromRpm(500, 0.5)).toBe(4);
    expect(gearFromRpm(1000, 0.5)).toBe(6);
  });

  it("engineRpmFromWheel — floors at idle 900 and rises with gear ratio", () => {
    expect(engineRpmFromWheel(0, 0)).toBe(900);
    const g1 = engineRpmFromWheel(200, 1);
    const g6 = engineRpmFromWheel(200, 6);
    expect(g1).toBeGreaterThan(g6);
    expect(g6).toBeGreaterThanOrEqual(900);
  });

  it("brakeGlowIntensity — heats then cools, stays in [0,1]", () => {
    let g = 0;
    for (let i = 0; i < 60; i++) g = brakeGlowIntensity(g, 1, 1 / 60);
    expect(g).toBeGreaterThan(0.6);
    expect(g).toBeLessThanOrEqual(1);
    for (let i = 0; i < 1800; i++) g = brakeGlowIntensity(g, 0, 1 / 60);
    expect(g).toBeLessThan(0.02);
    expect(g).toBeGreaterThanOrEqual(0);
  });

  it("indicatorPhase — square wave at 1.5 Hz", () => {
    // Period T = 1 / 1.5, half-period = 1/3s. Sample well inside each half.
    expect(indicatorPhase(0.05)).toBe(0);
    expect(indicatorPhase(0.4)).toBe(1);
    expect(indicatorPhase(0.72)).toBe(0);
    expect(indicatorPhase(1.05)).toBe(1);
  });

  it("thermalStep — converges to ambient with 0 throttle & clamps", () => {
    let t = 80;
    for (let i = 0; i < 5000; i++) t = thermalStep(t, 0, 10, 0.05, 25);
    expect(t).toBeLessThan(30);
    expect(t).toBeGreaterThanOrEqual(25);

    // High load ramps up but clamps at 140
    let hot = 80;
    for (let i = 0; i < 5000; i++) hot = thermalStep(hot, 1, 5, 0.1, 25);
    expect(hot).toBeLessThanOrEqual(140);
  });

  it("CAMERA_ANCHORS — has all six named anchors with 3-tuple positions", () => {
    for (const k of ["driver", "cockpit", "hood", "roof", "rear", "mirrorL", "mirrorR"] as const) {
      const a = CAMERA_ANCHORS[k];
      expect(a.pos.length).toBe(3);
      expect(a.look.length).toBe(3);
    }
  });
});
