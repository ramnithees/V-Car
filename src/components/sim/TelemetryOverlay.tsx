import { usePlayback } from "./store";

/**
 * Dev-only Vehicle Dynamics Telemetry HUD.
 * Toggled from CameraControls → "Telemetry". Values are pushed by the
 * Vehicle controller at ~30 Hz from the same physics samples that drive the
 * animation, so what you see here is exactly what's animating.
 */
export function TelemetryOverlay() {
  const show = usePlayback((s) => s.showTelemetry);
  const t = usePlayback((s) => s.telemetry);
  if (!show) return null;

  return (
    <div
      className="hidden md:block absolute top-3 right-3 w-60 lg:w-64 bg-card/85 backdrop-blur border border-border rounded-md p-3 text-[11px] font-mono tabular-nums text-muted-foreground pointer-events-none space-y-2"
      aria-label="Vehicle dynamics telemetry"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-foreground/80">
        <span>Vehicle Dynamics</span>
        <span className="text-primary">DEV</span>
      </div>

      <Row label="Speed" value={t.speed_kmh.toFixed(1)} unit="km/h" />
      <Row label="Wheel RPM" value={t.wheelRpm.toFixed(0)} />
      <Row label="Steering" value={t.steer_deg.toFixed(1)} unit="°" />

      <Bar label="Throttle" value={t.throttle} color="#22c55e" />
      <Bar label="Brake" value={t.brake} color="#ef4444" />

      <div className="grid grid-cols-2 gap-x-3 pt-1 border-t border-border/60">
        <Row label="Roll" value={t.rollDeg.toFixed(2)} unit="°" />
        <Row label="Pitch" value={t.pitchDeg.toFixed(2)} unit="°" />
        <Row label="Lat" value={t.latG.toFixed(2)} unit="g" />
        <Row label="Lon" value={t.lonG.toFixed(2)} unit="g" />
        <Row label="G tot" value={t.gTotal.toFixed(2)} unit="g" />
        <Row
          label="W F/R"
          value={`${(t.weightFront * 100).toFixed(0)}/${((1 - t.weightFront) * 100).toFixed(0)}`}
          unit="%"
        />
      </div>

      <div className="pt-1 border-t border-border/60">
        <div className="text-[10px] uppercase tracking-widest text-foreground/70 mb-1">
          Suspension travel (mm)
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <Row label="FL" value={(t.susTravel[0] * 1000).toFixed(1)} />
          <Row label="FR" value={(t.susTravel[1] * 1000).toFixed(1)} />
          <Row label="RL" value={(t.susTravel[2] * 1000).toFixed(1)} />
          <Row label="RR" value={(t.susTravel[3] * 1000).toFixed(1)} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground/80">{label}</span>
      <span className="text-foreground">
        {value}
        {unit ? <span className="text-muted-foreground/70 ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground/80">{label}</span>
        <span className="text-foreground">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-border rounded overflow-hidden">
        <div
          className="h-full rounded transition-[width] duration-75"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
