/**
 * Rendering regression: enforce WebGL shadow-caster budget.
 *
 * Root cause of the "blank 3D playback" bug was resource exhaustion from
 * multiple shadow-casting *lights* combined with the deprecated
 * PCFSoftShadowMap type. This test statically scans the sim modules to
 * guarantee we never regress by adding another shadow-casting light.
 *
 * Mesh-level `castShadow` is fine (cheap); only LIGHTS with castShadow
 * allocate a shadow map framebuffer, so those are what we cap.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/components";
const LIGHT_TAGS = ["directionalLight", "spotLight", "pointLight"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function countShadowLights(source: string): number {
  // Match <lightTag ...> blocks that contain `castShadow` before the closing `>`
  let n = 0;
  for (const tag of LIGHT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*?\\bcastShadow\\b[^>]*?/?>`, "gs");
    n += (source.match(re) ?? []).length;
    // Multi-line JSX where props span multiple lines
    const reMulti = new RegExp(`<${tag}\\b[\\s\\S]*?/>`, "g");
    for (const block of source.match(reMulti) ?? []) {
      if (
        block.includes("castShadow") &&
        !new RegExp(`<${tag}\\b[^>]*?\\bcastShadow\\b[^>]*?/?>`, "s").test(block)
      ) {
        n += 1;
      }
    }
  }
  return n;
}

describe("rendering budget", () => {
  it("does not use the deprecated PCFSoftShadowMap type", () => {
    const scene = readFileSync("src/components/Sim3DScene.tsx", "utf8");
    expect(scene).not.toMatch(/PCFSoftShadowMap/);
  });

  it("has at most one shadow-casting light across the entire sim scene", () => {
    const files = walk(ROOT);
    let total = 0;
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const n = countShadowLights(src);
      if (n > 0) offenders.push(`${f}: ${n}`);
      total += n;
    }
    // Budget = 1 (the main sun directional in Sim3DScene)
    expect({ total, offenders }).toEqual({
      total: 1,
      offenders: ["src/components/Sim3DScene.tsx: 1"],
    });
  });

  it("registers a webglcontextlost handler on the Canvas", () => {
    const scene = readFileSync("src/components/Sim3DScene.tsx", "utf8");
    expect(scene).toMatch(/webglcontextlost/);
    expect(scene).toMatch(/webglcontextrestored/);
  });
});
