/**
 * Snapshot utilities for the PDF report.
 * - captureSceneSnapshot: grabs the currently-mounted R3F canvas as a PNG dataURL
 * - renderPathSnapshot:   rasterises a top-down XY vehicle path (safety-tinted) via 2D canvas
 * - renderElevationSnapshot: rasterises an elevation profile (station vs z)
 *
 * These run in the browser only (called from downloadPDF).
 */
import type { PathSample } from "@/components/sim/store";

export function captureSceneSnapshot(): string | null {
  try {
    // The R3F canvas is the only <canvas> inside the 3D playback panel.
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    canvases.forEach((c) => {
      const a = c.width * c.height;
      if (a > bestArea) {
        best = c;
        bestArea = a;
      }
    });
    const chosen = best as HTMLCanvasElement | null;
    if (!chosen) return null;
    return chosen.toDataURL("image/png");
  } catch {
    return null;
  }
}

interface PathOpts {
  width?: number;
  height?: number;
  bg?: string;
}

export function renderPathSnapshot(samples: PathSample[], opts: PathOpts = {}): string | null {
  if (!samples.length) return null;
  const w = opts.width ?? 900;
  const h = opts.height ?? 620;
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d");
  if (!ctx) return null;

  // background
  ctx.fillStyle = opts.bg ?? "#f8fafc";
  ctx.fillRect(0, 0, w, h);

  // bounds
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minY) minY = s.z;
    if (s.z > maxY) maxY = s.z;
  }
  const pad = 30;
  const dx = Math.max(1, maxX - minX),
    dy = Math.max(1, maxY - minY);
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy);
  const tx = (x: number) => pad + (x - minX) * scale;
  const ty = (y: number) => h - pad - (y - minY) * scale;

  // grid
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const gx = pad + i * ((w - pad * 2) / 8);
    ctx.beginPath();
    ctx.moveTo(gx, pad);
    ctx.lineTo(gx, h - pad);
    ctx.stroke();
    const gy = pad + i * ((h - pad * 2) / 8);
    ctx.beginPath();
    ctx.moveTo(pad, gy);
    ctx.lineTo(w - pad, gy);
    ctx.stroke();
  }

  // road corridor (thicker gray underlay)
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = tx(s.x),
      py = ty(s.z);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // colored by safety score
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const score = (a.safety_score + b.safety_score) / 2;
    ctx.strokeStyle = safetyColor(score);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx(a.x), ty(a.z));
    ctx.lineTo(tx(b.x), ty(b.z));
    ctx.stroke();
  }

  // start/end markers
  const first = samples[0],
    last = samples[samples.length - 1];
  ctx.fillStyle = "#059669";
  ctx.beginPath();
  ctx.arc(tx(first.x), ty(first.z), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.arc(tx(last.x), ty(last.z), 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.font = "600 12px sans-serif";
  ctx.fillText("START", tx(first.x) + 10, ty(first.z) + 4);
  ctx.fillText("END", tx(last.x) + 10, ty(last.z) + 4);

  // legend
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Path colored by safety score", pad, 18);
  const legend = [
    ["Safe (>75)", "#059669"],
    ["Warn (50-75)", "#d97706"],
    ["High risk (25-50)", "#ea580c"],
    ["Critical (<25)", "#dc2626"],
  ];
  legend.forEach(([label, color], i) => {
    const x = w - pad - 160,
      y = 12 + i * 14;
    ctx.fillStyle = color as string;
    ctx.fillRect(x, y - 8, 10, 10);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label as string, x + 16, y);
  });

  return cvs.toDataURL("image/png");
}

export function renderElevationSnapshot(samples: PathSample[]): string | null {
  if (!samples.length) return null;
  const w = 900,
    h = 260;
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);

  const pad = 34;
  let minY = Infinity,
    maxY = -Infinity;
  for (const s of samples) {
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  if (maxY - minY < 1) {
    maxY = minY + 1;
  }
  const maxS = samples[samples.length - 1].s_m;
  const tx = (s: number) => pad + (s / maxS) * (w - pad * 2);
  const ty = (y: number) => h - pad - ((y - minY) / (maxY - minY)) * (h - pad * 2);

  // grid
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const gy = pad + i * ((h - pad * 2) / 6);
    ctx.beginPath();
    ctx.moveTo(pad, gy);
    ctx.lineTo(w - pad, gy);
    ctx.stroke();
  }

  // fill under curve
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  samples.forEach((s) => ctx.lineTo(tx(s.s_m), ty(s.y)));
  ctx.lineTo(w - pad, h - pad);
  ctx.closePath();
  ctx.fillStyle = "rgba(14,116,144,0.15)";
  ctx.fill();

  // line
  ctx.strokeStyle = "#0e7490";
  ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = tx(s.s_m),
      py = ty(s.y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // axes labels
  ctx.fillStyle = "#334155";
  ctx.font = "11px sans-serif";
  ctx.fillText("Elevation (m)", 6, 14);
  ctx.fillText(`${maxY.toFixed(1)}`, 4, pad + 6);
  ctx.fillText(`${minY.toFixed(1)}`, 4, h - pad + 4);
  ctx.fillText("0 m", pad - 6, h - pad + 16);
  ctx.fillText(`${(maxS / 1000).toFixed(2)} km`, w - pad - 30, h - pad + 16);

  return cvs.toDataURL("image/png");
}

function safetyColor(score: number): string {
  if (score >= 75) return "#059669";
  if (score >= 50) return "#d97706";
  if (score >= 25) return "#ea580c";
  return "#dc2626";
}
