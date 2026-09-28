import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAt, sampleZAtDistance, usePlayback } from "./store";
import { damp } from "./textures";
import { VehicleDynamicsCtx, useDynamicsRef } from "./vehicle/dynamics";
import { brakeGlowIntensity } from "./vehicle/helpers";
import { Body } from "./vehicle/Body";
import { Wheel } from "./vehicle/Wheel";
import { Lights } from "./vehicle/Lights";
import { SuspensionCorner } from "./vehicle/Suspension";
import { Steering } from "./vehicle/Steering";
import { Interior } from "./vehicle/Interior";

/**
 * Vehicle Controller — Phase 6.
 *
 * Same physics/animation loop as Phase 2 (identical refs, identical
 * spring–damper integrator, identical Ackermann steering). What's new:
 *
 *  - Render tree is now composed from focused subcomponents (Body,
 *    Wheel, Lights, Suspension, Steering, Interior) instead of one
 *    monolithic JSX block.
 *  - Every subcomponent reads a shared `VehicleDynamics` ref bag
 *    populated inside THIS useFrame — no extra logic loops that could
 *    race with physics.
 *  - Lamp emissive intensity, brake-disc glow, steering-wheel angle,
 *    and suspension mesh compression are all derived here and mutated
 *    on refs (no React re-renders).
 */
export function Vehicle({ color = "#22d3ee" }: { color?: string }) {
  const body = useRef<THREE.Group>(null!);
  const chassis = useRef<THREE.Group>(null!);
  const wheels = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const flAssembly = useRef<THREE.Group>(null!);
  const frAssembly = useRef<THREE.Group>(null!);

  const spinRef = useRef(0);
  const lastYaw = useRef<number | null>(null);
  const rollSmooth = useRef(0);
  const pitchSmooth = useRef(0);
  // Smoothed road-grade pitch applied to the outer body group (road slope,
  // distinct from the G-force chassis pitch below).
  const roadPitchSmooth = useRef(0);
  // Smoothed road bank applied to the outer body group so wheels + chassis
  // rotate together with the banked road surface.
  const roadBankSmooth = useRef(0);
  const steerLSmooth = useRef(0);
  const steerRSmooth = useRef(0);

  // Spring–damper state for each wheel (compression in meters, +compressed).
  const susPos = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const susVel = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const bodyBounce = useRef(0);
  const bodyBounceVel = useRef(0);

  const teleAccum = useRef(0);

  // Shared dynamic-state bag for subcomponents.
  const dyn = useDynamicsRef();

  // Geometry constants
  const trackHalf = 0.85;
  const wheelBase = 2.7;
  const wheelBaseHalf = 1.35;
  const wheelR = 0.36;
  const chassisRestY = 0.42;
  const MAX_STEER_RAD = THREE.MathUtils.degToRad(35);

  const K = 80;
  const C = 14;
  const MAX_TRAVEL = 0.06;
  const BODY_K = 30;
  const BODY_C = 8;

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s || !body.current) return;

    // === 4-wheel contact solver on the road spline ===
    // Sample elevation at front and rear axle arc-lengths. This grounds the
    // vehicle on inclined/graded roads (0°–60°+) instead of using only the
    // centre-point elevation, which caused front-wheel clipping on slopes.
    const zFront = sampleZAtDistance(st.samples, s.s_m + wheelBaseHalf);
    const zRear = sampleZAtDistance(st.samples, s.s_m - wheelBaseHalf);
    const zAvg = (zFront + zRear) * 0.5;
    // atan2(dz, wheelBase) — positive when nose is higher (uphill).
    const roadPitchTarget = Math.atan2(zFront - zRear, wheelBase);
    // Smooth road pitch to eliminate spline-derivative micro-jitter but
    // remain responsive on real grade changes.
    roadPitchSmooth.current = damp(roadPitchSmooth.current, roadPitchTarget, 12, dt);
    const roadPitch = roadPitchSmooth.current;

    // Road bank at current station — sign convention matches Road.tsx
    // (bank_rad > 0 → road's left edge lifts). Vehicle must roll with the
    // road: left side up = right side down = negative rotation.z on the
    // body's local frame (mesh forward = -Z, so local +X = vehicle right;
    // positive rotation.z lifts +X, hence we negate).
    const bankTarget = s.bank_rad ?? 0;
    roadBankSmooth.current = damp(roadBankSmooth.current, bankTarget, 10, dt);
    const roadBank = roadBankSmooth.current;

    // === World transform ===
    // YXZ: yaw first, then pitch about local X (mesh right after yaw), then
    // bank about local Z (mesh forward after yaw+pitch). Order matters —
    // otherwise bank would rotate about world Z and mis-align the car.
    body.current.rotation.order = "YXZ";
    body.current.position.set(s.x, chassisRestY + zAvg, -s.y);

    const yawTarget = s.heading_rad - Math.PI / 2;
    if (lastYaw.current == null) lastYaw.current = yawTarget;
    let dy = yawTarget - lastYaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    let yaw = lastYaw.current + dy * (1 - Math.exp(-18 * dt));
    if (yaw > Math.PI) yaw -= Math.PI * 2;
    else if (yaw < -Math.PI) yaw += Math.PI * 2;
    lastYaw.current = yaw;
    body.current.rotation.y = yaw;
    // Road-grade pitch + road-bank roll on the outer body group. Wheels are
    // children of this group so they rotate with the road plane, staying in
    // contact on any slope + bank combination.
    body.current.rotation.x = roadPitch;
    body.current.rotation.z = -roadBank;

    // === Chassis roll & pitch (smoothed) ===
    rollSmooth.current = damp(rollSmooth.current, s.roll_rad, 8, dt);
    pitchSmooth.current = damp(pitchSmooth.current, s.pitch_rad, 8, dt);

    // === Spring–damper suspension per wheel ===
    const G = 9.80665;
    const latN = Math.max(-1, Math.min(1, s.lat_accel / (0.9 * G)));
    const lonN = Math.max(-1, Math.min(1, s.long_accel / (0.9 * G)));
    const kLon = 0.032;
    const kLat = 0.028;
    const target = [
      -latN * kLat + -lonN * kLon,
      +latN * kLat + -lonN * kLon,
      -latN * kLat + +lonN * kLon,
      +latN * kLat + +lonN * kLon,
    ];

    const MAX_H = 0.008;
    const steps = Math.max(1, Math.ceil(dt / MAX_H));
    const h = dt / steps;
    let sumComp = 0;
    for (let i = 0; i < 4; i++) {
      let x = susPos.current[i];
      let v = susVel.current[i];
      const tgt = target[i];
      for (let s2 = 0; s2 < steps; s2++) {
        const a = -K * (x - tgt) - C * v;
        v += a * h;
        x += v * h;
        if (x > MAX_TRAVEL) {
          x = MAX_TRAVEL;
          if (v > 0) v = 0;
        } else if (x < -MAX_TRAVEL) {
          x = -MAX_TRAVEL;
          if (v < 0) v = 0;
        }
      }
      susPos.current[i] = x;
      susVel.current[i] = v;
      sumComp += x;
    }

    const bAvg = sumComp / 4;
    for (let s2 = 0; s2 < steps; s2++) {
      const bA = -BODY_K * (bodyBounce.current - bAvg) - BODY_C * bodyBounceVel.current;
      bodyBounceVel.current += bA * h;
      bodyBounce.current += bodyBounceVel.current * h;
    }

    if (chassis.current) {
      chassis.current.position.y = -bodyBounce.current * 0.5;
      chassis.current.rotation.z = rollSmooth.current;
      chassis.current.rotation.x = pitchSmooth.current;
    }

    for (let i = 0; i < 4; i++) {
      const w = wheels.current[i];
      if (w) w.position.y = susPos.current[i];
    }

    // === Wheel spin ===
    const visualDt = dt * st.speed;
    spinRef.current -= (s.speed_mps * visualDt) / wheelR;
    for (const w of wheels.current) {
      if (w) w.rotation.x = spinRef.current;
    }

    // === Ackermann steering ===
    const steerAvg = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(s.steering_deg),
      -MAX_STEER_RAD,
      MAX_STEER_RAD,
    );
    let steerL = steerAvg;
    let steerR = steerAvg;
    const EPS = 1e-3;
    if (Math.abs(steerAvg) > EPS) {
      const R = wheelBase / Math.tan(Math.abs(steerAvg));
      const inner = Math.atan(wheelBase / Math.max(0.4, R - trackHalf));
      const outer = Math.atan(wheelBase / (R + trackHalf));
      if (steerAvg > 0) {
        steerL = inner;
        steerR = outer;
      } else {
        steerL = -outer;
        steerR = -inner;
      }
    }
    steerLSmooth.current = damp(steerLSmooth.current, steerL, 14, dt);
    steerRSmooth.current = damp(steerRSmooth.current, steerR, 14, dt);
    if (flAssembly.current) flAssembly.current.rotation.y = steerLSmooth.current;
    if (frAssembly.current) frAssembly.current.rotation.y = steerRSmooth.current;

    // === Populate shared dynamics bag for subcomponents ===
    dyn.time.v += dt;
    dyn.susPos[0] = susPos.current[0];
    dyn.susPos[1] = susPos.current[1];
    dyn.susPos[2] = susPos.current[2];
    dyn.susPos[3] = susPos.current[3];
    dyn.steerL.v = steerLSmooth.current;
    dyn.steerR.v = steerRSmooth.current;
    dyn.steerAvgDeg.v = s.steering_deg;
    dyn.speedMps.v = s.speed_mps;

    const throttle = Math.max(0, Math.min(1, s.long_accel / (0.5 * G)));
    const brake = Math.max(0, Math.min(1, -s.long_accel / (0.6 * G)));
    dyn.throttle.v = throttle;
    dyn.brake.v = brake;
    dyn.brakeGlow.v = brakeGlowIntensity(dyn.brakeGlow.v, brake, dt);
    dyn.reverseOn.v = s.speed_mps < -0.1 ? 1 : 0;

    // DRL always on, headlights = simple ambient heuristic (always on for dev)
    dyn.drlOn.v = 1;
    dyn.headlightsOn.v = 1;
    dyn.fogOn.v = 0;
    dyn.interiorOn.v = 1;

    // Indicators — steering magnitude beyond ~4° with sustained heading change.
    const iThresh = 4;
    if (s.steering_deg > iThresh) {
      dyn.indicatorL.v = 1;
      dyn.indicatorR.v = 0;
    } else if (s.steering_deg < -iThresh) {
      dyn.indicatorL.v = 0;
      dyn.indicatorR.v = 1;
    } else {
      dyn.indicatorL.v = 0;
      dyn.indicatorR.v = 0;
    }

    // === Telemetry emit (~30 Hz) ===
    teleAccum.current += dtRaw;
    if (st.showTelemetry && teleAccum.current > 0.033) {
      teleAccum.current = 0;
      const rpm = (s.speed_mps / (2 * Math.PI * wheelR)) * 60;
      const gLat = s.lat_accel / G;
      const gLon = s.long_accel / G;
      const dFront = -0.22 * gLon;
      const dRight = -0.35 * gLat;
      st.setTelemetry({
        speed_kmh: s.speed_mps * 3.6,
        steer_deg: s.steering_deg,
        throttle,
        brake,
        wheelRpm: rpm,
        susTravel: [susPos.current[0], susPos.current[1], susPos.current[2], susPos.current[3]],
        rollDeg: (rollSmooth.current * 180) / Math.PI,
        pitchDeg: (pitchSmooth.current * 180) / Math.PI,
        latG: gLat,
        lonG: gLon,
        gTotal: Math.hypot(gLat, gLon),
        weightFront: Math.max(0, Math.min(1, 0.5 + dFront)),
        weightRight: Math.max(0, Math.min(1, 0.5 + dRight)),
      });
    }
  });

  const wheelSlots: [number, [number, number, number], "fl" | "fr" | "rl" | "rr"][] = useMemo(
    () => [
      [0, [trackHalf, 0, -wheelBaseHalf], "fl"],
      [1, [-trackHalf, 0, -wheelBaseHalf], "fr"],
      [2, [trackHalf, 0, wheelBaseHalf], "rl"],
      [3, [-trackHalf, 0, wheelBaseHalf], "rr"],
    ],
    [],
  );

  return (
    <VehicleDynamicsCtx.Provider value={dyn}>
      <group ref={body}>
        {/* Chassis: rolls, pitches, bounces. Wheels are siblings so they stay grounded. */}
        <group ref={chassis}>
          <Body color={color} />
          <Lights />
          <Interior />
          <Steering />
        </group>

        {/* Wheels + per-corner suspension viz (siblings of chassis) */}
        {wheelSlots.map(([idx, pos, key]) => {
          const isFront = key === "fl" || key === "fr";
          const steerRef = key === "fl" ? flAssembly : key === "fr" ? frAssembly : undefined;
          const outward: 1 | -1 = pos[0] > 0 ? 1 : -1;
          const inner = (
            <>
              <group ref={(el) => (wheels.current[idx] = el)}>
                <Wheel outward={outward} />
              </group>
              <SuspensionCorner cornerIdx={idx as 0 | 1 | 2 | 3} side={outward} />
            </>
          );
          return isFront ? (
            <group key={key} position={pos} ref={steerRef}>
              {inner}
            </group>
          ) : (
            <group key={key} position={pos}>
              {inner}
            </group>
          );
        })}
      </group>
    </VehicleDynamicsCtx.Provider>
  );
}
