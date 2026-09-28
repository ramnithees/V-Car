import { useEffect, useRef } from "react";
import { usePlayback, type PathSample } from "./store";
import { LIMIT_LABEL, type LimitFactor } from "@/lib/physics/simulation";

/**
 * Adaptive Safe Speed HUD.
 * Live readout of Driver Target, Adaptive Safe Speed, Current Vehicle Speed
 * and the currently-binding physical constraint. Subscribes directly to the
 * playback store — zero drift from the 3D scene / minimap / telemetry.
 */
export function SafeSpeedHud({
  samples,
  targetKmh,
}: {
  samples: PathSample[];
  targetKmh: number | null;
}) {
  const safeRef = useRef<HTMLSpanElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const limitRef = useRef<HTMLSpanElement>(null);
  const barSafeRef = useRef<HTMLDivElement>(null);
  const barCurRef = useRef<HTMLDivElement>(null);
  const marginRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!samples.length) return;
    const maxK =
      Math.max(targetKmh ?? 0, ...samples.map((s) => (s.safe_speed_mps ?? s.speed_mps) * 3.6)) || 1;
    const paint = (progress: number) => {
      const i = Math.min(
        samples.length - 1,
        Math.max(0, Math.round(progress * (samples.length - 1))),
      );
      const s = samples[i];
      const safeK = (s.safe_speed_mps ?? s.speed_mps) * 3.6;
      const curK = s.speed_mps * 3.6;
      const factor = (s.limiting_factor as LimitFactor | undefined) ?? "target";
      const margin = safeK > 0 ? Math.max(0, ((safeK - curK) / safeK) * 100) : 0;
      if (safeRef.current) safeRef.current.textContent = `${safeK.toFixed(0)}`;
      if (curRef.current) curRef.current.textContent = `${curK.toFixed(0)}`;
      if (marginRef.current) marginRef.current.textContent = `${margin.toFixed(1)}%`;
      if (limitRef.current) limitRef.current.textContent = LIMIT_LABEL[factor] ?? factor;
      if (barSafeRef.current)
        barSafeRef.current.style.width = `${Math.min(100, (safeK / maxK) * 100)}%`;
      if (barCurRef.current)
        barCurRef.current.style.width = `${Math.min(100, (curK / maxK) * 100)}%`;
    };
    paint(usePlayback.getState().progress);
    const unsub = usePlayback.subscribe((st) => paint(st.progress));
    return () => {
      unsub();
    };
  }, [samples, targetKmh]);

  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Adaptive safe-speed controller
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Target{" "}
          <span className="text-primary font-semibold ml-1 num">
            {targetKmh ? targetKmh.toFixed(0) : "—"}
          </span>
          <span className="text-muted-foreground ml-0.5">km/h</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Cell label="Target">
          <span className="text-lg sm:text-2xl font-semibold num text-primary">
            {targetKmh ? targetKmh.toFixed(0) : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground ml-1">km/h</span>
        </Cell>
        <Cell label="Safe (adaptive)">
          <span ref={safeRef} className="text-lg sm:text-2xl font-semibold num text-success">
            —
          </span>
          <span className="text-[10px] text-muted-foreground ml-1">km/h</span>
        </Cell>
        <Cell label="Current">
          <span ref={curRef} className="text-lg sm:text-2xl font-semibold num">
            —
          </span>
          <span className="text-[10px] text-muted-foreground ml-1">km/h</span>
        </Cell>
        <Cell label="Stability margin">
          <span ref={marginRef} className="text-lg sm:text-2xl font-semibold num text-success">
            —
          </span>
        </Cell>
      </div>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Actual vs safe
        </div>
        <div className="relative h-2 rounded bg-background/60 overflow-hidden border border-border/60">
          <div ref={barSafeRef} className="absolute inset-y-0 left-0 bg-success/30" />
          <div ref={barCurRef} className="absolute inset-y-0 left-0 bg-primary/80" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <div className="text-muted-foreground uppercase tracking-widest">Limiting factor</div>
        <span
          ref={limitRef}
          className="px-2 py-0.5 rounded bg-warning/15 text-warning font-medium num"
        >
          Driver target
        </span>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">
        {label}
      </div>
      <div className="mt-0.5 tabular-nums">{children}</div>
    </div>
  );
}
