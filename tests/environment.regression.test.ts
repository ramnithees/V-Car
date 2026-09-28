import { describe, it, expect } from "vitest";
import { runSimulation } from "@/lib/physics/simulation";
import { createTerrainSampler } from "@/components/sim/terrain-height";
import { roadStraight, roadCurved, roadMixed, TEST_VEHICLE } from "./fixtures";
import type { PathSample } from "@/components/sim/store";

function samplesFrom(road: ReturnType<typeof roadStraight>): PathSample[] {
  const res = runSimulation(TEST_VEHICLE, road);
  return res.samples as PathSample[];
}

describe("environment / terrain sampler alignment", () => {
  const samples = samplesFrom(roadMixed(1200));
  const sampler = createTerrainSampler(samples);

  it("returns finite heights everywhere inside bounds", () => {
    const { bounds } = sampler;
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const x = bounds.minX + t * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + t * (bounds.maxZ - bounds.minZ);
      const h = sampler.heightAt(x, z);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it("returns road-follow height near the spline", () => {
    for (let i = 0; i < samples.length; i += 20) {
      const s = samples[i];
      const h = sampler.heightAt(s.x, -s.y);
      expect(Math.abs(h - s.z)).toBeLessThan(0.5);
    }
  });

  it("is deterministic across builds", () => {
    const sampler2 = createTerrainSampler(samples);
    for (let i = 0; i < samples.length; i += 30) {
      const s = samples[i];
      expect(sampler.heightAt(s.x, -s.y)).toBeCloseTo(sampler2.heightAt(s.x, -s.y), 4);
      expect(sampler.hillOnly(s.x, -s.y)).toBeCloseTo(sampler2.hillOnly(s.x, -s.y), 4);
    }
  });
});

describe("environment / facility placement invariants", () => {
  it("computes a valid off-road anchor on any road", () => {
    for (const roadFn of [roadStraight, roadCurved, roadMixed]) {
      const samples = samplesFrom(roadFn(800));
      const sampler = createTerrainSampler(samples);
      const s0 = samples[0];
      const s1 = samples[Math.min(samples.length - 1, 4)];
      const heading = Math.atan2(s1.y - s0.y, s1.x - s0.x);
      const nx = -Math.sin(heading);
      const ny = Math.cos(heading);
      const off = 130;
      const worldX = s0.x + nx * off;
      const worldZ = -(s0.y + ny * off);
      const groundY = sampler.heightAt(worldX, worldZ);
      expect(Number.isFinite(groundY)).toBe(true);
      expect(sampler.roadDistance(worldX, worldZ)).toBeGreaterThan(50);
    }
  });
});
