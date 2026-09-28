import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TerrainSampler } from "./terrain-height";

export interface PathSample {
  idx: number;
  s_m: number;
  t_s: number;
  x: number;
  y: number;
  z: number;
  heading_rad: number;
  speed_mps: number;
  lat_accel: number;
  long_accel: number;
  steering_deg: number;
  fuel_rate_lps: number;
  safety_score: number;
  radius_m: number | null;
  /** Road banking at this sample (rad, signed). 0 for back-compat samples. */
  bank_rad: number;
  /** Road grade at this sample (rad, +uphill). 0 for back-compat samples. */
  slope_rad: number;
  /** Adaptive safe-speed cap at this station (m/s). */
  safe_speed_mps: number;
  /** Dominant limit at this station (target / skid / rollover / brake / grade / top / grip). */
  limiting_factor: string;
}

export type CameraMode =
  | "chase"
  | "driver"
  | "hood"
  | "roof"
  | "top"
  | "side"
  | "front"
  | "drone"
  | "free"
  | "replay";

export const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: "chase", label: "Chase" },
  { id: "driver", label: "Driver" },
  { id: "hood", label: "Hood" },
  { id: "roof", label: "Roof" },
  { id: "top", label: "Top" },
  { id: "side", label: "Side" },
  { id: "front", label: "Front" },
  { id: "drone", label: "Drone" },
  { id: "free", label: "Free" },
  { id: "replay", label: "Replay" },
];

export interface InterpSample extends PathSample {
  /** interpolation-derived instantaneous body pitch (rad, +nose up) */
  pitch_rad: number;
  /** instantaneous body roll (rad, +right side down) */
  roll_rad: number;
}

interface PlaybackState {
  samples: PathSample[];
  duration: number;
  progress: number; // 0..1
  playing: boolean;
  speed: number; // playback multiplier
  cameraMode: CameraMode;
  fov: number;
  followDistance: number;
  sensitivity: number;
  smoothing: number;
  autoFollow: boolean;

  // perf monitor
  showPerf: boolean;
  perfStats: PerfStats;

  // debug overlay (spline, forward/right vectors, heading readout)
  showDebug: boolean;

  // dev telemetry HUD (physics readouts)
  showTelemetry: boolean;
  telemetry: TelemetryFrame;

  // shared terrain sampler (set by SimEnvironment) — read by cameras for
  // terrain-clearance guards so the view never sinks into a hill.
  terrainSampler: TerrainSampler | null;

  // actions
  setSamples: (s: PathSample[]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  setProgress: (p: number) => void;
  advance: (dt: number) => void;
  stepFrame: (dir: 1 | -1) => void;
  setSpeed: (v: number) => void;
  setCamera: (m: CameraMode) => void;
  setFov: (v: number) => void;
  setFollowDistance: (v: number) => void;
  setSensitivity: (v: number) => void;
  setSmoothing: (v: number) => void;
  setAutoFollow: (v: boolean) => void;
  togglePerf: () => void;
  setPerfStats: (p: Partial<PerfStats>) => void;
  toggleDebug: () => void;
  toggleTelemetry: () => void;
  setTelemetry: (t: Partial<TelemetryFrame>) => void;
  setTerrainSampler: (s: TerrainSampler | null) => void;
}

export interface TelemetryFrame {
  speed_kmh: number;
  steer_deg: number;
  throttle: number; // 0..1
  brake: number; // 0..1
  wheelRpm: number;
  susTravel: [number, number, number, number]; // meters, +compressed
  rollDeg: number;
  pitchDeg: number;
  latG: number;
  lonG: number;
  gTotal: number;
  weightFront: number; // 0..1 fraction of total load on front axle
  weightRight: number; // 0..1 fraction on right side
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  memoryMB: number | null;
  memoryLimitMB: number | null;
  renderer: string;
}

export const usePlayback = create<PlaybackState>()(
  subscribeWithSelector((set, get) => ({
    samples: [],
    duration: 0,
    progress: 0,
    // Playback starts paused so the user opts into motion (and GPU load).
    playing: false,
    speed: 1,
    cameraMode: "chase",
    fov: 55,
    followDistance: 10,
    sensitivity: 1,
    smoothing: 0.15,
    autoFollow: true,
    showPerf: false,
    perfStats: {
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      memoryMB: null,
      memoryLimitMB: null,
      renderer: "",
    },
    showDebug: false,
    showTelemetry: false,
    telemetry: {
      speed_kmh: 0,
      steer_deg: 0,
      throttle: 0,
      brake: 0,
      wheelRpm: 0,
      susTravel: [0, 0, 0, 0],
      rollDeg: 0,
      pitchDeg: 0,
      latG: 0,
      lonG: 0,
      gTotal: 0,
      weightFront: 0.5,
      weightRight: 0.5,
    },
    terrainSampler: null,

    setSamples: (s) => {
      const duration = s.length ? s[s.length - 1].t_s : 0;
      set({ samples: s, duration, progress: 0, playing: false });
    },
    play: () => set({ playing: true }),
    pause: () => set({ playing: false }),
    toggle: () => set((st) => ({ playing: !st.playing })),
    restart: () => set({ progress: 0, playing: true }),
    setProgress: (p) => set({ progress: Math.max(0, Math.min(1, p)) }),
    advance: (dt) => {
      const { playing, progress, speed, duration } = get();
      if (!playing || duration <= 0) return;
      const next = progress + (dt * speed) / duration;
      if (next >= 1) set({ progress: 1, playing: false });
      else set({ progress: next });
    },
    stepFrame: (dir) => {
      const { samples, progress } = get();
      if (samples.length < 2) return;
      const frameStep = 1 / (samples.length - 1);
      set({
        progress: Math.max(0, Math.min(1, progress + dir * frameStep)),
        playing: false,
      });
    },
    setSpeed: (v) => set({ speed: Math.max(0.1, Math.min(8, v)) }),
    setCamera: (m) => set({ cameraMode: m }),
    setFov: (v) => set({ fov: Math.max(20, Math.min(110, v)) }),
    setFollowDistance: (v) => set({ followDistance: Math.max(3, Math.min(60, v)) }),
    setSensitivity: (v) => set({ sensitivity: Math.max(0.1, Math.min(3, v)) }),
    setSmoothing: (v) => set({ smoothing: Math.max(0, Math.min(1, v)) }),
    setAutoFollow: (v) => set({ autoFollow: v }),
    togglePerf: () => set((st) => ({ showPerf: !st.showPerf })),
    setPerfStats: (p) => set((st) => ({ perfStats: { ...st.perfStats, ...p } })),
    toggleDebug: () => set((st) => ({ showDebug: !st.showDebug })),
    toggleTelemetry: () => set((st) => ({ showTelemetry: !st.showTelemetry })),
    setTelemetry: (t) => set((st) => ({ telemetry: { ...st.telemetry, ...t } })),
    setTerrainSampler: (s) => set({ terrainSampler: s }),
  })),
);

/** Interpolate a sample at fractional index i (0..n-1). */
export function sampleAt(samples: PathSample[], progress: number): InterpSample | null {
  if (!samples.length) return null;
  const n = samples.length;
  const f = Math.max(0, Math.min(1, progress)) * (n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const t = f - i0;
  const a = samples[i0];
  const b = samples[i1];
  // shortest-arc heading interp
  let dh = b.heading_rad - a.heading_rad;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const heading = a.heading_rad + dh * t;

  const speed = a.speed_mps + (b.speed_mps - a.speed_mps) * t;
  const lat = a.lat_accel + (b.lat_accel - a.lat_accel) * t;
  const lon = a.long_accel + (b.long_accel - a.long_accel) * t;
  const steerMag = a.steering_deg + (b.steering_deg - a.steering_deg) * t;

  // Turn direction — derived from heading derivative over a WIDE window so
  // that float noise on near-straight segments cannot flip the sign frame to
  // frame. Also produces a soft [-1,1] weight (dead-zoned) instead of a hard
  // ±1 toggle, which was the primary cause of visible body-roll and steering
  // flicker on straights.
  const wPrev = samples[Math.max(0, i0 - 3)];
  const wNext = samples[Math.min(n - 1, i1 + 3)];
  let dhWide = wNext.heading_rad - wPrev.heading_rad;
  while (dhWide > Math.PI) dhWide -= Math.PI * 2;
  while (dhWide < -Math.PI) dhWide += Math.PI * 2;
  // Dead-zone (~0.35°) below which we treat the road as straight, then
  // soft-saturate to ±1 over ~5.7°. Continuous → no sign flicker.
  const DEAD = 0.006;
  const FULL = 0.1;
  const mag = Math.max(0, Math.abs(dhWide) - DEAD) / (FULL - DEAD);
  const turnW = Math.sign(dhWide) * Math.min(1, mag);

  const G = 9.80665;
  // Body dynamics — magnitudes calibrated for stylized realism.
  const roll_rad = -turnW * Math.min(0.12, (Math.abs(lat) / G) * 0.06);
  const pitch_rad = Math.max(-0.09, Math.min(0.09, (-lon / G) * 0.05));

  // Signed steering: positive = left turn (matches +rotation.y on front wheels
  // when mesh forward is -Z). Uses the same smooth turn weight.
  const steer = steerMag * turnW;

  return {
    idx: i0,
    s_m: a.s_m + (b.s_m - a.s_m) * t,
    t_s: a.t_s + (b.t_s - a.t_s) * t,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    heading_rad: heading,
    speed_mps: speed,
    lat_accel: lat,
    long_accel: lon,
    steering_deg: steer,
    fuel_rate_lps: a.fuel_rate_lps + (b.fuel_rate_lps - a.fuel_rate_lps) * t,
    safety_score: a.safety_score + (b.safety_score - a.safety_score) * t,
    radius_m: a.radius_m,
    bank_rad: (a.bank_rad ?? 0) + ((b.bank_rad ?? 0) - (a.bank_rad ?? 0)) * t,
    slope_rad: (a.slope_rad ?? 0) + ((b.slope_rad ?? 0) - (a.slope_rad ?? 0)) * t,
    safe_speed_mps:
      (a.safe_speed_mps ?? speed) + ((b.safe_speed_mps ?? speed) - (a.safe_speed_mps ?? speed)) * t,
    limiting_factor: a.limiting_factor ?? "target",
    pitch_rad,
    roll_rad,
  };
}

/**
 * Convert an interpolated sim sample into world-space transform data.
 * Sim (x,y,z) → world (x, z, -y). Heading h is measured CCW in sim (x,y).
 * World travel direction = (cos h, 0, -sin h).
 * Mesh convention: vehicle model's front points along local -Z, so
 * body rotation.y must equal (h - π/2).
 */
export function worldFromSample(s: InterpSample) {
  const h = s.heading_rad;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  return {
    position: [s.x, s.z, -s.y] as [number, number, number],
    yaw: h - Math.PI / 2,
    forward: [cos, 0, -sin] as [number, number, number],
    right: [-sin, 0, -cos] as [number, number, number],
  };
}

/**
 * Sample road elevation (world Y in sim-space, i.e. PathSample.z) at a given
 * arc-length s_m along the road spline. Used by the vehicle contact solver to
 * ground each axle on the road surface for slopes up to 60°+.
 *
 * O(log n) binary search + linear interpolation. Clamps at spline endpoints.
 */
export function sampleZAtDistance(samples: PathSample[], s_m: number): number {
  const n = samples.length;
  if (!n) return 0;
  if (s_m <= samples[0].s_m) return samples[0].z;
  if (s_m >= samples[n - 1].s_m) return samples[n - 1].z;
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (samples[m].s_m <= s_m) lo = m;
    else hi = m;
  }
  const a = samples[lo],
    b = samples[hi];
  const denom = Math.max(1e-6, b.s_m - a.s_m);
  const t = (s_m - a.s_m) / denom;
  return a.z + (b.z - a.z) * t;
}
