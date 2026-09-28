import { describe, it, expect, beforeAll } from "vitest";
import { runSimulation, type RoadSpec } from "@/lib/physics/simulation";
import { createTerrainSampler, type TerrainSampler } from "@/components/sim/terrain-height";
import {
  computeVegetation,
  computeGrassTufts,
  computeLandscape,
  CLEARANCE,
} from "@/components/sim/placement";
import { roadStraight, roadCurved, roadMixed, TEST_VEHICLE } from "./fixtures";
import type { VehicleSpec } from "@/lib/physics";
import type { PathSample } from "@/components/sim/store";

/** High-torque variant so genuinely steep mountain grades remain climbable. */
const MTN_VEHICLE: VehicleSpec = {
  ...TEST_VEHICLE,
  max_power_kw: 300,
  max_torque_nm: 650,
  tire_friction_mu: 1.1,
};

/**
 * Protected road corridor regression suite.
 *
 * Phase 3 contract: the 10 m corridor either side of the centreline is a
 * guaranteed flat, banked road plane — no terrain noise pokes through, and
 * no vegetation/rock/pond is ever placed inside its clearance floor.
 * These tests run the REAL placement engine (src/components/sim/placement)
 * against the REAL terrain sampler across every road profile family.
 */

/** Steep, fully banked profile — grades + banked curves layered. */
const roadSteepBanked = (length_m: number): RoadSpec => ({
  length_m,
  surface_mu: 0.9,
  base_slope_deg: 4,
  curves: [
    { station: length_m * 0.25, radius: 150, angle_deg: 70, bank_deg: 8 },
    { station: length_m * 0.7, radius: 100, angle_deg: 80, bank_deg: 6 },
  ],
  slopes: [
    {
      direction: "uphill",
      angle_deg: 8,
      length_m: length_m * 0.3,
      transition_m: 60,
      bank_deg: 5,
      bank_dir: "left",
    },
    {
      direction: "downhill",
      angle_deg: 12,
      length_m: length_m * 0.25,
      transition_m: 60,
      bank_deg: 4,
      bank_dir: "right",
    },
  ],
});

/** Mountain profile — tight banked hairpins on sustained grades. */
const roadMountain = (length_m: number): RoadSpec => ({
  length_m,
  surface_mu: 0.85,
  base_slope_deg: 6,
  curves: [
    { station: length_m * 0.2, radius: 55, angle_deg: 150, bank_deg: 10 },
    { station: length_m * 0.5, radius: 70, angle_deg: 120, bank_deg: 8 },
    { station: length_m * 0.8, radius: 120, angle_deg: 60, bank_deg: 5 },
  ],
  slopes: [
    {
      direction: "uphill",
      angle_deg: 14,
      length_m: length_m * 0.35,
      transition_m: 80,
      bank_deg: 6,
      bank_dir: "left",
    },
    {
      direction: "downhill",
      angle_deg: 12,
      length_m: length_m * 0.3,
      transition_m: 80,
      bank_deg: 5,
      bank_dir: "right",
    },
  ],
});

const PROFILES: Array<{
  name: string;
  build: (len: number) => RoadSpec;
  len: number;
  vehicle?: VehicleSpec;
}> = [
  { name: "straight", build: roadStraight, len: 800 },
  { name: "curved (banked)", build: roadCurved, len: 1000 },
  { name: "mixed", build: roadMixed, len: 1200 },
  { name: "steep + banked", build: roadSteepBanked, len: 1000 },
  { name: "mountain hairpins", build: roadMountain, len: 1600, vehicle: MTN_VEHICLE },
];

/** Corridor half-width protected by terrain-height.ts (SHOULDER + BUFFER). */
const CORRIDOR = 10;
/** Tolerance for plane-vs-sampler comparisons (fp + station interpolation). */
const PLANE_TOL = 0.2;

describe("protected road corridor — all road profiles", () => {
  for (const profile of PROFILES) {
    describe(`profile: ${profile.name}`, () => {
      let samples: PathSample[];
      let sampler: TerrainSampler;

      beforeAll(() => {
        samples = runSimulation(profile.vehicle ?? TEST_VEHICLE, profile.build(profile.len))
          .samples as PathSample[];
        sampler = createTerrainSampler(samples);
      });

      it("terrain inside the 10 m corridor equals the banked road plane", () => {
        const curve = sampler.curve;
        expect(curve).not.toBeNull();
        const stations = curve!.stations;
        const lats = [-9.5, -6, -3, 0, 3, 6, 9.5];
        for (let i = 0; i < stations.length; i += 3) {
          const st = stations[i];
          for (const lat of lats) {
            const qx = st.wx + st.nx * lat;
            const qz = st.wz + st.nz * lat;
            const h = sampler.heightAt(qx, qz);
            const plane = st.wy + lat * Math.sin(st.bank) - 0.05;
            expect(
              Math.abs(h - plane),
              `station ${i} lat ${lat}: terrain ${h.toFixed(3)} vs road plane ${plane.toFixed(3)}`,
            ).toBeLessThan(PLANE_TOL);
          }
        }
      });

      it("terrain never pokes above the road plane inside the corridor", () => {
        // Bound is PLANE_TOL (not tighter) because the reference plane is
        // station-based while the sampler re-derives the nearest centreline
        // point per query — on tight banked hairpins the two parameterisations
        // differ by a few cm. Inside the corridor heightAt returns the banked
        // road plane exactly, so anything beyond PLANE_TOL is a real intrusion.
        const stations = sampler.curve!.stations;
        for (let i = 0; i < stations.length; i += 3) {
          const st = stations[i];
          for (const lat of [-8, -4, 0, 4, 8]) {
            const h = sampler.heightAt(st.wx + st.nx * lat, st.wz + st.nz * lat);
            const plane = st.wy + lat * Math.sin(st.bank) - 0.05;
            expect(
              h,
              `station ${i} lat ${lat}: terrain ${h.toFixed(3)} above plane ${plane.toFixed(3)}`,
            ).toBeLessThanOrEqual(plane + PLANE_TOL);
          }
        }
      });

      it("terrain surface is continuous across the corridor boundary", () => {
        const stations = sampler.curve!.stations;
        for (let i = 0; i < stations.length; i += 4) {
          const st = stations[i];
          for (const side of [1, -1]) {
            const hIn = sampler.heightAt(
              st.wx + st.nx * side * (CORRIDOR - 0.5),
              st.wz + st.nz * side * (CORRIDOR - 0.5),
            );
            const hOut = sampler.heightAt(
              st.wx + st.nx * side * (CORRIDOR + 0.5),
              st.wz + st.nz * side * (CORRIDOR + 0.5),
            );
            // No vertical seam/cliff at the corridor edge.
            expect(Math.abs(hOut - hIn)).toBeLessThan(0.5);
          }
        }
      });

      it("terrain stays finite over the whole bounds", () => {
        const { bounds } = sampler;
        for (let i = 0; i < 15; i++) {
          for (let j = 0; j < 15; j++) {
            const x = bounds.minX + (i / 14) * (bounds.maxX - bounds.minX);
            const z = bounds.minZ + (j / 14) * (bounds.maxZ - bounds.minZ);
            expect(Number.isFinite(sampler.heightAt(x, z))).toBe(true);
          }
        }
      });

      it("vehicle path is grounded on the terrain along the whole route", () => {
        for (let i = 0; i < samples.length; i += 10) {
          const s = samples[i];
          const h = sampler.heightAt(s.x, -s.y);
          expect(Math.abs(h - s.z)).toBeLessThan(0.5);
        }
      });

      it(`trees never intrude (≥ ${CLEARANCE.tree} m from road)`, () => {
        const { trees } = computeVegetation(samples, sampler);
        expect(trees.length).toBeGreaterThan(0);
        for (const t of trees) {
          const d = sampler.roadDistance(t.x, t.z);
          expect(
            d,
            `tree at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) dist ${d.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(CLEARANCE.tree);
          // grounded, not floating/sunk
          expect(Math.abs(t.y - sampler.heightAt(t.x, t.z))).toBeLessThan(1e-6);
        }
      });

      it(`bushes never intrude (≥ ${CLEARANCE.bush} m from road)`, () => {
        const { bushes } = computeVegetation(samples, sampler);
        expect(bushes.length).toBeGreaterThan(0);
        for (const b of bushes) {
          expect(sampler.roadDistance(b.x, b.z)).toBeGreaterThanOrEqual(CLEARANCE.bush);
          expect(Math.abs(b.y - sampler.heightAt(b.x, b.z))).toBeLessThan(1e-6);
        }
      });

      it(`grass tufts never intrude (≥ ${CLEARANCE.grass} m from road)`, () => {
        const tufts = computeGrassTufts(samples, sampler);
        expect(tufts.length).toBeGreaterThan(0);
        for (const g of tufts) {
          expect(sampler.roadDistance(g.x, g.z)).toBeGreaterThanOrEqual(CLEARANCE.grass);
          expect(Math.abs(g.y - sampler.heightAt(g.x, g.z))).toBeLessThan(1e-6);
        }
      });

      it(`rocks never intrude (≥ ${CLEARANCE.rock} m from road)`, () => {
        const { rocks } = computeLandscape(samples, sampler);
        for (const r of rocks) {
          expect(sampler.roadDistance(r.x, r.z)).toBeGreaterThanOrEqual(CLEARANCE.rock);
          expect(Math.abs(r.y - sampler.heightAt(r.x, r.z))).toBeLessThan(1e-6);
        }
      });

      it(`ponds never intrude (≥ ${CLEARANCE.pond} m from road)`, () => {
        const { ponds } = computeLandscape(samples, sampler);
        for (const p of ponds) {
          expect(sampler.roadDistance(p.x, p.z)).toBeGreaterThanOrEqual(CLEARANCE.pond);
        }
      });

      it("no vegetation instance sits inside the protected corridor at all", () => {
        const { trees, bushes } = computeVegetation(samples, sampler);
        const tufts = computeGrassTufts(samples, sampler);
        const { rocks } = computeLandscape(samples, sampler);
        const all = [...trees, ...bushes, ...tufts, ...rocks];
        expect(all.length).toBeGreaterThan(0);
        for (const p of all) {
          expect(sampler.roadDistance(p.x, p.z)).toBeGreaterThan(CORRIDOR);
        }
      });

      it("placement is deterministic across runs", () => {
        const a = computeVegetation(samples, sampler);
        const b = computeVegetation(samples, sampler);
        const ga = computeGrassTufts(samples, sampler);
        const gb = computeGrassTufts(samples, sampler);
        expect(a.trees.length).toBe(b.trees.length);
        expect(a.bushes.length).toBe(b.bushes.length);
        expect(ga.length).toBe(gb.length);
        for (let i = 0; i < a.trees.length; i++) {
          expect(a.trees[i].x).toBeCloseTo(b.trees[i].x, 10);
          expect(a.trees[i].z).toBeCloseTo(b.trees[i].z, 10);
        }
      });
    });
  }
});
