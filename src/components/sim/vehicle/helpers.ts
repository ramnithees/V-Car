/**
 * Vehicle helpers — pure, deterministic, testable.
 * No THREE / R3F imports so the vitest suite can exercise these directly.
 */

/** Approximate 6-speed automatic gear from wheel RPM and throttle. */
export function gearFromRpm(wheelRpm: number, throttle: number): number {
  const w = Math.max(0, wheelRpm);
  if (w < 40) return throttle > 0.05 ? 1 : 0; // 0 = N
  if (w < 130) return 1;
  if (w < 260) return 2;
  if (w < 420) return 3;
  if (w < 620) return 4;
  if (w < 860) return 5;
  return 6;
}

/** Engine RPM from wheel RPM & gear (finalDrive ~ 3.7). */
export function engineRpmFromWheel(wheelRpm: number, gear: number): number {
  if (gear <= 0) return 900; // idle
  const ratios = [3.4, 2.05, 1.42, 1.0, 0.82, 0.68];
  const r = ratios[Math.min(ratios.length, gear) - 1] ?? 0.68;
  return Math.max(900, wheelRpm * 3.7 * r);
}

/** Brake disc glow intensity (0..1) from rolling brake input. */
export function brakeGlowIntensity(prev: number, brake: number, dt: number): number {
  // Heats fast, cools slow — physical inspired
  const heatRate = 1.6;
  const coolRate = 0.45;
  const target = Math.max(0, Math.min(1, brake));
  const k = target > prev ? heatRate : coolRate;
  const next = prev + (target - prev) * (1 - Math.exp(-k * Math.max(0, dt)));
  return Math.max(0, Math.min(1, next));
}

/** Indicator blink phase — square wave at 1.5 Hz, 0 or 1. */
export function indicatorPhase(t_s: number): number {
  const HZ = 1.5;
  return Math.floor(t_s * HZ * 2) % 2;
}

/** Simple engine thermal integrator (°C). */
export function thermalStep(
  tempC: number,
  throttle: number,
  speedMps: number,
  dt: number,
  ambientC = 25,
): number {
  const load = Math.max(0, Math.min(1, throttle));
  const heatIn = 55 * load; // °C/s at full load
  const airflow = 0.15 + 0.02 * Math.max(0, speedMps);
  const cool = airflow * (tempC - ambientC);
  const dT = (heatIn - cool) * Math.max(0, dt);
  const next = tempC + dT;
  return Math.max(ambientC, Math.min(140, next));
}

/** Camera anchor offsets in the vehicle's local frame (X=left, -Z=front). */
export const CAMERA_ANCHORS = {
  driver: { pos: [0.4, 1.15, 0.15], look: [0.4, 1.05, -3.5] },
  cockpit: { pos: [0.4, 1.05, 0.5], look: [0.4, 1.0, -3.0] },
  hood: { pos: [0, 1.05, -1.4], look: [0, 1.0, -5.0] },
  roof: { pos: [0, 1.55, 0.2], look: [0, 1.2, -5.0] },
  rear: { pos: [0, 1.3, 2.6], look: [0, 1.1, -2.0] },
  mirrorL: { pos: [0.9, 1.05, -0.7], look: [0.9, 1.05, 3.5] },
  mirrorR: { pos: [-0.9, 1.05, -0.7], look: [-0.9, 1.05, 3.5] },
} as const;
