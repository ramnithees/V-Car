import { useState } from "react";
import { CAMERA_MODES, usePlayback } from "./store";
import { Camera, RefreshCw, Activity, Bug, Gauge, ChevronDown, ChevronUp } from "lucide-react";

export function CameraControls({ inline = false }: { inline?: boolean }) {
  const mode = usePlayback((s) => s.cameraMode);
  const fov = usePlayback((s) => s.fov);
  const dist = usePlayback((s) => s.followDistance);
  const sens = usePlayback((s) => s.sensitivity);
  const smooth = usePlayback((s) => s.smoothing);
  const autoFollow = usePlayback((s) => s.autoFollow);
  const showPerf = usePlayback((s) => s.showPerf);
  const showDebug = usePlayback((s) => s.showDebug);
  const showTelemetry = usePlayback((s) => s.showTelemetry);
  // Default expanded when inline (dedicated section); overlay stays collapsed on mobile.
  const [expanded, setExpanded] = useState(inline);

  const containerClass = inline
    ? "border border-border rounded-md p-3 space-y-2 text-xs bg-card/50"
    : "absolute top-2 left-2 sm:top-3 sm:left-3 bg-card/90 backdrop-blur border border-border rounded-md p-2 sm:p-3 space-y-2 text-xs w-[46vw] max-w-[220px] sm:w-56";

  const bodyVisibility = inline
    ? expanded
      ? "block space-y-2"
      : "hidden"
    : `${expanded ? "block" : "hidden"} sm:block space-y-2`;

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Camera className="w-3.5 h-3.5" /> Camera Controls
        </span>
        <button
          type="button"
          className={`${inline ? "" : "sm:hidden"} p-1 rounded hover:bg-muted min-h-8 min-w-8 grid place-items-center`}
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse camera controls" : "Expand camera controls"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {(inline ? expanded : true) && (
        <select
          value={mode}
          onChange={(e) => usePlayback.getState().setCamera(e.target.value as never)}
          className="w-full bg-background border border-border rounded px-2 py-1 text-xs min-h-9"
          aria-label="Camera mode"
        >
          {CAMERA_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      <div className={bodyVisibility}>
        <Slider
          label="FOV"
          value={fov}
          min={20}
          max={110}
          step={1}
          onChange={(v) => usePlayback.getState().setFov(v)}
          suffix="°"
        />
        <Slider
          label="Distance"
          value={dist}
          min={3}
          max={60}
          step={1}
          onChange={(v) => usePlayback.getState().setFollowDistance(v)}
          suffix="m"
        />
        <Slider
          label="Sensitivity"
          value={sens}
          min={0.1}
          max={3}
          step={0.1}
          onChange={(v) => usePlayback.getState().setSensitivity(v)}
        />
        <Slider
          label="Smoothing"
          value={smooth}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => usePlayback.getState().setSmoothing(v)}
        />

        <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => usePlayback.getState().setAutoFollow(e.target.checked)}
          />
          Auto-follow
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              const st = usePlayback.getState();
              st.setFov(55);
              st.setFollowDistance(10);
              st.setSensitivity(1);
              st.setSmoothing(0.15);
              st.setAutoFollow(true);
            }}
            className="inline-flex items-center justify-center gap-1 py-1 rounded border border-border hover:bg-muted"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={() => usePlayback.getState().togglePerf()}
            aria-pressed={showPerf}
            className={`inline-flex items-center justify-center gap-1 py-1 rounded border ${
              showPerf
                ? "border-primary text-primary bg-primary/10"
                : "border-border hover:bg-muted"
            }`}
            title="Toggle performance overlay"
          >
            <Activity className="w-3 h-3" /> Perf
          </button>
          <button
            onClick={() => usePlayback.getState().toggleDebug()}
            aria-pressed={showDebug}
            className={`inline-flex items-center justify-center gap-1 py-1 rounded border ${
              showDebug
                ? "border-primary text-primary bg-primary/10"
                : "border-border hover:bg-muted"
            }`}
            title="Toggle debug overlay (spline, forward vector, heading)"
          >
            <Bug className="w-3 h-3" /> Debug
          </button>
          <button
            onClick={() => usePlayback.getState().toggleTelemetry()}
            aria-pressed={showTelemetry}
            className={`inline-flex items-center justify-center gap-1 py-1 rounded border ${
              showTelemetry
                ? "border-primary text-primary bg-primary/10"
                : "border-border hover:bg-muted"
            }`}
            title="Toggle vehicle dynamics telemetry HUD"
          >
            <Gauge className="w-3 h-3" /> Telemetry
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="num tabular-nums">
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}
