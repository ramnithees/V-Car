import { useMemo } from "react";

interface Curve {
  station: number;
  radius: number;
  angle_deg: number;
  bank_deg?: number;
}

/** 2D top-down SVG preview computed from curvature integration. */
export function RoadMap({ length_m, curves }: { length_m: number; curves: Curve[] }) {
  const path = useMemo(() => {
    const step = 5;
    const n = Math.ceil(length_m / step) + 1;
    let x = 0,
      y = 0,
      h = 0;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const s = i * step;
      pts.push([x, y]);
      let radius = 0;
      for (const c of curves) {
        const arcLen = (c.radius * c.angle_deg * Math.PI) / 180;
        if (s >= c.station && s <= c.station + arcLen) {
          radius = c.radius;
          break;
        }
      }
      const kappa = radius ? 1 / radius : 0;
      h += kappa * step;
      x += Math.cos(h) * step;
      y += Math.sin(h) * step;
    }
    return pts;
  }, [length_m, curves]);

  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const w = maxX - minX || 1,
    h = maxY - minY || 1;
  const pad = 40;
  const scale = Math.min(700 / w, 400 / h);
  const d = path
    .map(([x, y], i) => {
      const px = (x - minX) * scale + pad;
      const py = (y - minY) * scale + pad;
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  const start = [(0 - minX) * scale + pad, (0 - minY) * scale + pad];
  const endPt = path[path.length - 1];
  const end = [(endPt[0] - minX) * scale + pad, (endPt[1] - minY) * scale + pad];

  return (
    <svg viewBox={`0 0 ${700 + pad * 2} ${400 + pad * 2}`} className="w-full h-auto">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="oklch(0.3 0.02 240 / 0.3)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <path
        d={d}
        fill="none"
        stroke="oklch(0.78 0.14 195)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d={d}
        fill="none"
        stroke="oklch(0.98 0.005 240)"
        strokeWidth="1"
        strokeDasharray="4 6"
        opacity="0.6"
      />
      <circle cx={start[0]} cy={start[1]} r="6" fill="oklch(0.7 0.18 155)" />
      <circle cx={end[0]} cy={end[1]} r="6" fill="oklch(0.62 0.22 25)" />
    </svg>
  );
}
