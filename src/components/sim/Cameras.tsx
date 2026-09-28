import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback } from "./store";

/**
 * Camera Manager — imperatively drives the default camera each frame based on
 * the selected mode. All transitions are eased (lerp/slerp) — never a hard cut.
 */
export function Cameras() {
  const { camera } = useThree();
  // drei OrbitControls instance type is not exported in a usable form here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbit = useRef<any>(null);
  const targetPos = useRef(new THREE.Vector3(0, 5, 20));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const currentLook = useRef(new THREE.Vector3(0, 0, 0));
  const replayTimer = useRef(0);
  const replayMode = useRef<"chase" | "side" | "drone" | "top" | "hood">("chase");
  const droneAngle = useRef(0);
  const mouseInput = useRef({ dx: 0, dy: 0 });

  // Pooled scratch vectors — allocated once, reused every frame. Eliminates
  // per-frame GC pressure that manifested as camera micro-jitter on longer
  // sessions.
  const carPos = useRef(new THREE.Vector3()).current;
  const fwd = useRef(new THREE.Vector3()).current;
  const rgt = useRef(new THREE.Vector3()).current;
  const up = useRef(new THREE.Vector3(0, 1, 0)).current;
  const tmp = useRef(new THREE.Vector3()).current;

  // Mouse look for driver/hood/roof modes (subtle head sway)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseInput.current.dx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseInput.current.dy = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Priority 0 — a non-zero priority would take over R3F's render loop and
  // require manual gl.render() calls, causing the entire scene to go black.
  // Frame order is enforced by JSX mount order in Sim3DScene:
  // SceneAdvancer → Vehicle → Cameras (Cameras mounts last).
  useFrame((_, dt) => {
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s) return;

    // Vehicle world transform. World travel direction = (cos h, 0, -sin h).
    const h = s.heading_rad;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    carPos.set(s.x, s.z + 0.42, -s.y);
    fwd.set(cosH, 0, -sinH);
    rgt.set(-sinH, 0, -cosH);

    if (st.cameraMode === "free") {
      if (orbit.current) {
        orbit.current.enabled = true;
        if (st.autoFollow) orbit.current.target.lerp(carPos, 0.1);
      }
      return;
    }
    if (orbit.current) orbit.current.enabled = false;

    // Determine effective mode (replay cycles through cinematic angles)
    let mode = st.cameraMode;
    if (mode === "replay") {
      replayTimer.current += dt;
      if (replayTimer.current > 4) {
        replayTimer.current = 0;
        const opts: Array<typeof replayMode.current> = ["chase", "side", "drone", "top", "hood"];
        replayMode.current = opts[Math.floor(Math.random() * opts.length)];
      }
      mode = replayMode.current;
    }

    const dist = st.followDistance;

    switch (mode) {
      case "chase": {
        targetPos.current
          .copy(carPos)
          .addScaledVector(fwd, -dist)
          .addScaledVector(up, dist * 0.45);
        targetLook.current.copy(carPos).addScaledVector(fwd, 4);
        break;
      }
      case "driver": {
        targetPos.current
          .copy(carPos)
          .addScaledVector(fwd, 0.2)
          .addScaledVector(up, 0.55)
          .addScaledVector(rgt, -0.35);
        targetLook.current.copy(carPos).addScaledVector(fwd, 15).addScaledVector(up, 0.3);
        break;
      }
      case "hood": {
        targetPos.current.copy(carPos).addScaledVector(fwd, 1.7).addScaledVector(up, 0.55);
        targetLook.current.copy(carPos).addScaledVector(fwd, 20).addScaledVector(up, 0.2);
        break;
      }
      case "roof": {
        targetPos.current.copy(carPos).addScaledVector(fwd, 0.1).addScaledVector(up, 1.8);
        targetLook.current.copy(carPos).addScaledVector(fwd, 18);
        break;
      }
      case "top": {
        targetPos.current.copy(carPos).addScaledVector(up, Math.max(30, dist * 4));
        targetLook.current.copy(carPos);
        break;
      }
      case "side": {
        targetPos.current
          .copy(carPos)
          .addScaledVector(rgt, dist)
          .addScaledVector(up, dist * 0.25);
        targetLook.current.copy(carPos);
        break;
      }
      case "front": {
        targetPos.current
          .copy(carPos)
          .addScaledVector(fwd, dist)
          .addScaledVector(up, dist * 0.25);
        targetLook.current.copy(carPos);
        break;
      }
      case "drone": {
        droneAngle.current += dt * 0.25 * st.sensitivity;
        const r = Math.max(dist, 15);
        tmp.set(Math.cos(droneAngle.current) * r, r * 0.6, Math.sin(droneAngle.current) * r);
        targetPos.current.copy(carPos).add(tmp);
        targetLook.current.copy(carPos);
        break;
      }
    }

    // === Terrain clearance guard ===
    // Sample terrain under the camera target. If the ground rises above the
    // camera minus a safety margin, lift the camera so it never sinks into
    // a hill and the road stays visible from every angle. Driver / hood /
    // roof modes are on the vehicle itself, so we exempt them.
    const sampler = st.terrainSampler;
    if (sampler && mode !== "driver" && mode !== "hood" && mode !== "roof") {
      const margin = mode === "top" ? 6 : 2.2;
      const ground = sampler.heightAt(targetPos.current.x, targetPos.current.z);
      const minY = ground + margin;
      if (targetPos.current.y < minY) targetPos.current.y = minY;
    }

    // Frame-rate independent easing. Higher rate = snappier.
    // smoothing 0 → rate 12 (snappy), smoothing 1 → rate 1.5 (heavy lag)
    const posRate = THREE.MathUtils.lerp(12, 1.5, st.smoothing);
    const lookRate = THREE.MathUtils.lerp(14, 2, st.smoothing);
    const posAlpha = 1 - Math.exp(-posRate * dt);
    const lookAlpha = 1 - Math.exp(-lookRate * dt);

    camera.position.lerp(targetPos.current, posAlpha);
    currentLook.current.lerp(targetLook.current, lookAlpha);
    camera.lookAt(currentLook.current);

    if ("fov" in camera) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov += (st.fov - cam.fov) * (1 - Math.exp(-8 * dt));
      cam.updateProjectionMatrix();
    }
  });

  return (
    <OrbitControls
      ref={orbit}
      makeDefault={false}
      enableDamping
      dampingFactor={0.12}
      enabled={false}
    />
  );
}
