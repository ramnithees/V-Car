import { useEffect, useMemo, useRef } from "react";
import { sampleAt, usePlayback, type PathSample } from "./store";

/**
 * Interactive GPS-style minimap synced to the shared playback store.
 * Uses direct SVG DOM updates on subscribe → zero React re-renders per frame.
 */
export function LiveMinimap({ samples }: { samples: PathSample[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const doneRef = useRef<SVGPathElement>(null);

  const { d, w, h, project } = useMemo(() => {
    if (!samples.length)
      return {
        d: "",
        w: 400,
        h: 260,
        pad: 20,
        project: (_x: number, _y: number) => [0, 0] as [number, number],
      };
    const xs = samples.map((s) => s.x);
    const ys = samples.map((s) => s.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const pad = 20;
    const w = 480,
      h = 260;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
    const offX = (w - spanX * scale) / 2 - minX * scale;
    const offY = (h - spanY * scale) / 2 - minY * scale;
    const project = (x: number, y: number): [number, number] => [
      x * scale + offX,
      h - (y * scale + offY),
    ];
    const d = samples
      .map((s, i) => {
        const [px, py] = project(s.x, s.y);
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");
    return { d, w, h, pad, project };
  }, [samples]);

  useEffect(() => {
    if (!samples.length) return;
    const update = (st: ReturnType<typeof usePlayback.getState>) => {
      const s = sampleAt(st.samples, st.progress);
      if (!s || !carRef.current || !doneRef.current) return;
      const [cx, cy] = project(s.x, s.y);
      const deg = (-s.heading_rad * 180) / Math.PI;
      carRef.current.setAttribute(
        "transform",
        `translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${deg.toFixed(1)})`,
      );

      // Completed segment
      const nMax = Math.max(1, Math.floor(st.progress * (samples.length - 1)) + 1);
      let path = "";
      for (let i = 0; i < nMax; i++) {
        const [px, py] = project(samples[i].x, samples[i].y);
        path += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      }
      doneRef.current.setAttribute("d", path);
    };
    update(usePlayback.getState());
    const unsub = usePlayback.subscribe(update);
    return unsub;
  }, [samples, project]);

  if (!samples.length) return null;
  const [sx, sy] = project(samples[0].x, samples[0].y);
  const [ex, ey] = project(samples[samples.length - 1].x, samples[samples.length - 1].y);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      role="img"
      aria-label="Live minimap"
    >
      <defs>
        <pattern id="mm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 L 0 0 0 24"
            fill="none"
            stroke="oklch(0.3 0.02 240 / 0.4)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#mm-grid)" />
      {/* Full road (remaining) */}
      <path
        d={d}
        fill="none"
        stroke="oklch(0.55 0.02 240 / 0.6)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Completed portion */}
      <path
        ref={doneRef}
        fill="none"
        stroke="oklch(0.78 0.14 195)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Start / Finish */}
      <circle cx={sx} cy={sy} r={6} fill="oklch(0.72 0.18 150)" stroke="white" strokeWidth={1.2} />
      <circle cx={ex} cy={ey} r={6} fill="oklch(0.62 0.22 25)" stroke="white" strokeWidth={1.2} />
      <text x={sx + 10} y={sy - 6} fontSize={10} fill="oklch(0.8 0.02 240)">
        Start
      </text>
      <text x={ex + 10} y={ey - 6} fontSize={10} fill="oklch(0.8 0.02 240)">
        Finish
      </text>
      {/* Vehicle icon */}
      <g ref={carRef}>
        <polygon
          points="0,-8 6,7 0,4 -6,7"
          fill="oklch(0.85 0.15 60)"
          stroke="black"
          strokeWidth={0.8}
        />
      </g>
    </svg>
  );
}
