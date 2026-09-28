import { usePlayback, sampleAt } from "./store";
import { Play, Pause, RotateCcw, StepBack, StepForward, Rewind, FastForward } from "lucide-react";
import { useEffect, useState } from "react";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function PlaybackControls() {
  const playing = usePlayback((s) => s.playing);
  const progress = usePlayback((s) => s.progress);
  const speed = usePlayback((s) => s.speed);
  const duration = usePlayback((s) => s.duration);
  const [hudSpeed, setHudSpeed] = useState(0);

  // Live HUD updates (subscribe outside React tree)
  useEffect(() => {
    const unsub = usePlayback.subscribe((st) => {
      const s = sampleAt(st.samples, st.progress);
      if (s) setHudSpeed(s.speed_mps * 3.6);
    });
    return unsub;
  }, []);

  const t = progress * duration;
  const speedIdx = SPEEDS.indexOf(speed);

  return (
    <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 bg-card/90 backdrop-blur border border-border rounded-md p-2 space-y-2">
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <IconBtn label="Restart" onClick={() => usePlayback.getState().restart()}>
          <RotateCcw className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Step back" onClick={() => usePlayback.getState().stepFrame(-1)}>
          <StepBack className="w-4 h-4" />
        </IconBtn>
        <IconBtn
          label="Slower"
          onClick={() => usePlayback.getState().setSpeed(SPEEDS[Math.max(0, speedIdx - 1)])}
        >
          <Rewind className="w-4 h-4" />
        </IconBtn>
        <button
          onClick={() => usePlayback.getState().toggle()}
          className="text-xs font-semibold px-3 py-2 min-h-9 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? "Pause" : "Play"}
        </button>
        <IconBtn
          label="Faster"
          onClick={() =>
            usePlayback.getState().setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, speedIdx + 1)])
          }
        >
          <FastForward className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Step forward" onClick={() => usePlayback.getState().stepFrame(1)}>
          <StepForward className="w-4 h-4" />
        </IconBtn>
        <div className="ml-auto flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground">
          <span className="num">{speed}×</span>
          <span className="num tabular-nums hidden sm:inline">
            {t.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          <span className="num tabular-nums text-primary">{hudSpeed.toFixed(0)} km/h</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.0005}
        value={progress}
        onChange={(e) => {
          usePlayback.getState().setProgress(Number(e.target.value));
          usePlayback.getState().pause();
        }}
        className="w-full accent-primary"
        aria-label="Timeline scrubber"
      />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="p-2 min-h-9 min-w-9 rounded border border-border hover:bg-muted text-foreground grid place-items-center"
    >
      {children}
    </button>
  );
}
