import { useEffect, useMemo, useRef } from "react";
import { usePlayback, type PathSample } from "./store";

interface Channel {
  key: string;
  label: string;
  color: string;
  unit: string;
  transform: (s: PathSample, ctx: ChannelCtx) => number;
  overlay?: { color: string; value: (ctx: ChannelCtx) => number; label: string };
}

interface ChannelCtx {
  targetMps: number;
  vehicleMu: number;
  roadMu: number;
  ssf: number;
}

const G = 9.80665;

const CHANNELS: Channel[] = [
  {
    key: "speed",
    label: "Speed vs safe cap",
    color: "#22d3ee",
    unit: "km/h",
    transform: (s) => s.speed_mps * 3.6,
    overlay: {
      color: "#22c55e",
      label: "Safe cap",
      value: () => 0, // computed dynamically per-sample via valueAt below
    },
  },
  {
    key: "safe",
    label: "Adaptive safe speed",
    color: "#22c55e",
    unit: "km/h",
    transform: (s) => (s.safe_speed_mps ?? s.speed_mps) * 3.6,
  },
  {
    key: "target_delta",
    label: "Safe vs target (%)",
    color: "#a78bfa",
    unit: "%",
    transform: (s, ctx) =>
      ctx.targetMps > 0 ? ((s.safe_speed_mps ?? s.speed_mps) / ctx.targetMps) * 100 : 0,
  },
  {
    key: "lat_g",
    label: "Lateral acceleration",
    color: "#f5b042",
    unit: "g",
    transform: (s) => s.lat_accel / G,
  },
  {
    key: "long_g",
    label: "Longitudinal acceleration",
    color: "#8b5cf6",
    unit: "g",
    transform: (s) => s.long_accel / G,
  },
  {
    key: "friction_usage",
    label: "Road friction usage",
    color: "#ef4444",
    unit: "%",
    transform: (s, ctx) => {
      const mu = Math.min(ctx.vehicleMu, ctx.roadMu);
      return Math.min(200, (s.lat_accel / G / Math.max(0.05, mu)) * 100);
    },
  },
  {
    key: "roll_margin",
    label: "Rollover margin",
    color: "#0ea5e9",
    unit: "%",
    transform: (s, ctx) =>
      Math.max(0, Math.min(100, (1 - s.lat_accel / G / Math.max(0.5, ctx.ssf)) * 100)),
  },
  {
    key: "grip_remaining",
    label: "Tire grip remaining",
    color: "#14b8a6",
    unit: "%",
    transform: (s, ctx) => {
      const mu = Math.min(ctx.vehicleMu, ctx.roadMu);
      return Math.max(0, Math.min(100, (1 - s.lat_accel / G / Math.max(0.05, mu)) * 100));
    },
  },
  {
    key: "fuel",
    label: "Fuel rate",
    color: "#f97316",
    unit: "L/s",
    transform: (s) => s.fuel_rate_lps,
  },
  {
    key: "safety",
    label: "Safety score",
    color: "#22c55e",
    unit: "/100",
    transform: (s) => s.safety_score,
  },
];

/**
 * Live telemetry — canvas-plotted, drawn left→right as the vehicle progresses.
 * Reads from the same playback store as the 3D scene → zero drift.
 * Now includes adaptive safe-speed, friction usage, rollover margin, and
 * remaining tire grip — all derived from the same PathSample stream.
 */
export function LiveTelemetry({
  samples,
  targetKmh,
  vehicleMu = 1,
  roadMu = 1,
  ssf = 1.4,
}: {
  samples: PathSample[];
  targetKmh?: number | null;
  vehicleMu?: number;
  roadMu?: number;
  ssf?: number;
}) {
  const totalT = samples.length ? samples[samples.length - 1].t_s : 0;
  const ctx: ChannelCtx = {
    targetMps: targetKmh ? targetKmh / 3.6 : 0,
    vehicleMu,
    roadMu,
    ssf,
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {CHANNELS.map((c) => (
        <ChannelChart
          key={c.key}
          samples={samples}
          channel={c}
          totalT={totalT}
          ctx={ctx}
          targetKmh={targetKmh ?? null}
        />
      ))}
    </div>
  );
}

function ChannelChart({
  samples,
  channel,
  totalT,
  ctx,
  targetKmh,
}: {
  samples: PathSample[];
  channel: Channel;
  totalT: number;
  ctx: ChannelCtx;
  targetKmh: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  const { values, safeOverlay, targetOverlay, yMin, yMax } = useMemo(() => {
    const values = samples.map((s) => channel.transform(s, ctx));
    let safeOverlay: number[] | null = null;
    let targetOverlay: number | null = null;
    if (channel.key === "speed") {
      safeOverlay = samples.map((s) => (s.safe_speed_mps ?? s.speed_mps) * 3.6);
      targetOverlay = targetKmh ?? null;
    }
    const yMin = Math.min(...values, 0);
    let yMax = Math.max(...values, 0);
    if (safeOverlay) {
      yMax = Math.max(yMax, ...safeOverlay);
      if (targetOverlay != null) yMax = Math.max(yMax, targetOverlay);
    }
    if (yMax - yMin < 0.001) {
      yMax = yMin + 1;
    }
    const pad = (yMax - yMin) * 0.08;
    return { values, safeOverlay, targetOverlay, yMin: yMin - pad, yMax: yMax + pad };
  }, [samples, channel, ctx, targetKmh]);

  useEffect(() => {
    const draw = (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width,
        h = rect.height;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const c = canvas.getContext("2d");
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);

      c.strokeStyle = "oklch(0.3 0.02 240 / 0.5)";
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * (h - 20) + 4;
        c.moveTo(30, y);
        c.lineTo(w - 6, y);
      }
      c.stroke();

      c.fillStyle = "oklch(0.7 0.02 240)";
      c.font = "10px system-ui, sans-serif";
      for (let i = 0; i <= 4; i++) {
        const val = yMax - (i / 4) * (yMax - yMin);
        const y = (i / 4) * (h - 20) + 8;
        c.fillText(val.toFixed(Math.abs(val) < 10 ? 2 : 0), 2, y);
      }

      const iMax = Math.max(1, Math.floor(progress * (values.length - 1)) + 1);
      const xAt = (i: number) => 30 + (i / Math.max(1, values.length - 1)) * (w - 36);
      const yAt = (v: number) => 4 + (1 - (v - yMin) / (yMax - yMin)) * (h - 20);

      // Overlay: adaptive safe cap on the speed chart.
      if (safeOverlay) {
        c.strokeStyle = "#22c55e";
        c.lineWidth = 1.2;
        c.setLineDash([4, 3]);
        c.beginPath();
        for (let i = 0; i < iMax; i++) {
          const x = xAt(i),
            y = yAt(safeOverlay[i]);
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
        c.setLineDash([]);
      }

      // Overlay: driver target line (horizontal) on the speed chart.
      if (targetOverlay != null) {
        c.strokeStyle = "#a78bfa";
        c.lineWidth = 1;
        c.setLineDash([2, 3]);
        c.beginPath();
        const y = yAt(targetOverlay);
        c.moveTo(30, y);
        c.lineTo(w - 6, y);
        c.stroke();
        c.setLineDash([]);
      }

      // Main series.
      c.strokeStyle = channel.color;
      c.lineWidth = 1.8;
      c.beginPath();
      for (let i = 0; i < iMax; i++) {
        const x = xAt(i),
          y = yAt(values[i]);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();

      const px = 30 + progress * (w - 36);
      c.strokeStyle = "oklch(0.85 0.15 60 / 0.9)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px, 0);
      c.lineTo(px, h - 12);
      c.stroke();

      c.fillStyle = "oklch(0.6 0.02 240)";
      c.fillText("0s", 30, h - 2);
      c.fillText(`${totalT.toFixed(1)}s`, w - 30, h - 2);

      if (valueRef.current) {
        const idx = Math.min(
          values.length - 1,
          Math.max(0, Math.round(progress * (values.length - 1))),
        );
        valueRef.current.textContent = `${values[idx].toFixed(2)} ${channel.unit}`;
      }
    };
    draw(usePlayback.getState().progress);
    const unsub = usePlayback.subscribe((st) => draw(st.progress));
    const onResize = () => draw(usePlayback.getState().progress);
    window.addEventListener("resize", onResize);
    return () => {
      unsub();
      window.removeEventListener("resize", onResize);
    };
  }, [values, safeOverlay, targetOverlay, yMin, yMax, channel, totalT]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {channel.label}
        </div>
        <span ref={valueRef} className="text-xs num tabular-nums" style={{ color: channel.color }}>
          —
        </span>
      </div>
      <div className="h-40 rounded border border-border/60 bg-background/40 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
}
