import { useEffect, useRef, useState } from "react";
import { usePlayback } from "../store";
import { engineRpmFromWheel, gearFromRpm, thermalStep } from "./helpers";

/**
 * Digital instrument cluster — pushes the same telemetry the Vehicle
 * controller emits at 30 Hz into a compact HUD panel positioned at the
 * bottom-right, out of the way of the Telemetry dev overlay.
 *
 * Fuel / Battery / temperatures are integrated locally from throttle &
 * speed so the cluster feels alive without changing the physics core.
 */
export function InstrumentCluster() {
  const t = usePlayback((s) => s.telemetry);
  const show = usePlayback((s) => s.showTelemetry); // reuse toggle
  const speed = t.speed_kmh;
  const wheelRpm = t.wheelRpm;
  const throttle = t.throttle;
  const brake = t.brake;

  const gear = gearFromRpm(wheelRpm, throttle);
  const engineRpm = engineRpmFromWheel(wheelRpm, gear);

  // Local thermal & fuel integrators (visual only)
  const [engineC, setEngineC] = useState(80);
  const [coolantC, setCoolantC] = useState(78);
  const [fuel, setFuel] = useState(0.86);
  const [battery, setBattery] = useState(0.72);
  const last = useRef(performance.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last.current) / 1000);
      last.current = now;
      setEngineC((c) => thermalStep(c, throttle, speed / 3.6, dt, 25));
      setCoolantC((c) => thermalStep(c, throttle * 0.9, speed / 3.6, dt, 25));
      setFuel((f) => Math.max(0, f - throttle * dt * 0.0004));
      setBattery((b) => {
        const draw = throttle * 0.0006;
        const regen = brake * 0.0003;
        return Math.max(0, Math.min(1, b - draw + regen));
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [throttle, brake, speed]);

  if (!show) return null;

  const stability = Math.max(0, Math.min(100, 100 - t.gTotal * 45));

  return (
    <div
      className="hidden lg:block absolute bottom-24 right-3 w-72 bg-card/85 backdrop-blur border border-border rounded-md p-3 text-[11px] font-mono tabular-nums text-muted-foreground pointer-events-none space-y-2"
      aria-label="Digital instrument cluster"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-foreground/80">
        <span>Instrument Cluster</span>
        <span className="text-primary">LIVE</span>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Big label="km/h" value={speed.toFixed(0)} />
        <Big label="RPM" value={engineRpm.toFixed(0)} />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
        <Stat label="Gear" value={gear === 0 ? "N" : `D${gear}`} />
        <Stat label="Steer" value={`${t.steer_deg.toFixed(0)}°`} />
        <Stat label="Yaw" value={`${t.rollDeg.toFixed(1)}°`} />
      </div>

      <Bar label="Throttle" value={throttle} color="#22c55e" />
      <Bar label="Brake" value={brake} color="#ef4444" />

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
        <Stat label="Fuel" value={`${(fuel * 100).toFixed(0)}%`} />
        <Stat label="Batt" value={`${(battery * 100).toFixed(0)}%`} />
        <Stat label="Engine" value={`${engineC.toFixed(0)}°C`} />
        <Stat label="Coolant" value={`${coolantC.toFixed(0)}°C`} />
        <Stat label="Roll" value={`${t.rollDeg.toFixed(1)}°`} />
        <Stat label="Pitch" value={`${t.pitchDeg.toFixed(1)}°`} />
      </div>

      <div className="pt-1 border-t border-border/60">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground/80">Stability Index</span>
          <span className="text-foreground">{stability.toFixed(0)}</span>
        </div>
        <div className="h-1.5 bg-border rounded overflow-hidden">
          <div
            className="h-full rounded"
            style={{
              width: `${stability}%`,
              background: stability > 70 ? "#22c55e" : stability > 40 ? "#eab308" : "#ef4444",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl text-foreground leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground/80">{label}</span>
      <span className="text-foreground">{value}</span>
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
