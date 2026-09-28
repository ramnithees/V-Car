import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { usePlayback } from "./store";

/**
 * PerfProbe — sampled inside the R3F Canvas.
 * Measures FPS/frame time and reads WebGLRenderer.info + gl context info.
 * Publishes to the playback store at ~4 Hz to keep re-renders cheap.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const setPerfStats = usePlayback((s) => s.setPerfStats);

  const frames = useRef(0);
  const accum = useRef(0);
  const lastPublish = useRef(0);
  const rendererName = useRef<string>("");

  useFrame((_, dt) => {
    frames.current += 1;
    accum.current += dt;
    lastPublish.current += dt;

    if (lastPublish.current < 0.25) return;

    const fps = frames.current / accum.current;
    const frameMs = (accum.current / frames.current) * 1000;

    if (!rendererName.current) {
      try {
        const ctx = gl.getContext() as WebGLRenderingContext;
        const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
        rendererName.current = dbg
          ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
          : ctx.getParameter(ctx.RENDERER) || "WebGL";
      } catch {
        rendererName.current = "WebGL";
      }
    }

    const info = gl.info;
    const mem = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;

    setPerfStats({
      fps,
      frameMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      memoryMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      memoryLimitMB: mem ? mem.jsHeapSizeLimit / 1048576 : null,
      renderer: rendererName.current,
    });

    frames.current = 0;
    accum.current = 0;
    lastPublish.current = 0;
  });

  return null;
}
