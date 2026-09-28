import { Activity, X } from "lucide-react";
import { usePlayback } from "./store";

/**
 * PerfOverlay — floating performance HUD.
 * Renders only when `showPerf` is enabled from the sim controls.
 */
export function PerfOverlay() {
  const show = usePlayback((s) => s.showPerf);
  const s = usePlayback((st) => st.perfStats);
  const togglePerf = usePlayback((st) => st.togglePerf);

  if (!show) return null;

  const fpsColor =
    s.fps >= 55 ? "text-emerald-400" : s.fps >= 30 ? "text-amber-400" : "text-red-400";
  const frameColor =
    s.frameMs <= 18 ? "text-emerald-400" : s.frameMs <= 33 ? "text-amber-400" : "text-red-400";
  const memPct =
    s.memoryMB != null && s.memoryLimitMB ? (s.memoryMB / s.memoryLimitMB) * 100 : null;

  return (
    <div className="absolute top-3 right-[13.5rem] w-56 bg-card/90 backdrop-blur border border-border rounded-md p-3 text-xs font-mono shadow-lg z-20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
          <Activity className="w-3.5 h-3.5" /> Performance
        </div>
        <button
          onClick={togglePerf}
          aria-label="Close performance overlay"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Row label="FPS" value={s.fps.toFixed(1)} valueClass={fpsColor} />
      <Row label="Frame" value={`${s.frameMs.toFixed(2)} ms`} valueClass={frameColor} />
      <div className="my-2 border-t border-border" />
      <Row label="Draw calls" value={s.drawCalls.toLocaleString()} />
      <Row label="Triangles" value={s.triangles.toLocaleString()} />
      <Row label="Geometries" value={String(s.geometries)} />
      <Row label="Textures" value={String(s.textures)} />
      <Row label="Programs" value={String(s.programs)} />
      <div className="my-2 border-t border-border" />
      <Row
        label="JS heap"
        value={
          s.memoryMB != null
            ? `${s.memoryMB.toFixed(1)} MB${memPct != null ? ` (${memPct.toFixed(0)}%)` : ""}`
            : "n/a"
        }
      />
      {s.memoryLimitMB != null && (
        <Row label="Heap limit" value={`${s.memoryLimitMB.toFixed(0)} MB`} />
      )}
      {s.renderer && (
        <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground break-words leading-snug">
          {s.renderer}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
