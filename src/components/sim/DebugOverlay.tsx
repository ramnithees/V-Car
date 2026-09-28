import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback, type PathSample } from "./store";

/**
 * In-scene debug overlay: road spline polyline, vehicle forward/right vectors,
 * axes helper on the car pivot, and a small HTML readout with heading + steering.
 * Rendered only when usePlayback.showDebug is true.
 *
 * Zero per-frame React state and zero per-frame allocations:
 *   - arrowHelper `args` reference stable Vector3 constants so R3F never
 *     reconstructs them.
 *   - Readout is written straight into #virtudrive-debug-readout from useFrame
 *     (throttled ~7 Hz). No setState → no re-renders → no frame spikes → no
 *     downstream vehicle-suspension instability.
 */

// Module-level stable references — never reallocated.
const ZERO = new THREE.Vector3(0, 0, 0);
const UNIT_X = new THREE.Vector3(1, 0, 0);
const FWD_ARGS: [THREE.Vector3, THREE.Vector3, number, number, number, number] = [
  UNIT_X,
  ZERO,
  6,
  0x22c55e,
  1.2,
  0.6,
];
const RGT_ARGS: [THREE.Vector3, THREE.Vector3, number, number, number, number] = [
  UNIT_X,
  ZERO,
  3,
  0xef4444,
  0.9,
  0.5,
];

export function DebugOverlay({ samples }: { samples: PathSample[] }) {
  const show = usePlayback((s) => s.showDebug);

  const splineGeom = useMemo(() => {
    if (samples.length < 2) return null;
    const pts = samples.map((s) => new THREE.Vector3(s.x, s.z + 0.05, -s.y));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [samples]);

  const fwdRef = useRef<THREE.ArrowHelper>(null!);
  const rgtRef = useRef<THREE.ArrowHelper>(null!);
  const carRef = useRef<THREE.Group>(null!);
  const readoutTick = useRef(0);

  // Scratch vectors reused every frame — no per-frame allocation.
  const posScratch = useMemo(() => new THREE.Vector3(), []);
  const fwdScratch = useMemo(() => new THREE.Vector3(), []);
  const rgtScratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!show) return;
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s) return;
    const h = s.heading_rad;
    posScratch.set(s.x, s.z + 0.9, -s.y);
    fwdScratch.set(Math.cos(h), 0, -Math.sin(h));
    rgtScratch.set(-Math.sin(h), 0, -Math.cos(h));
    if (carRef.current) carRef.current.position.copy(posScratch);
    if (fwdRef.current) {
      fwdRef.current.position.copy(posScratch);
      fwdRef.current.setDirection(fwdScratch);
    }
    if (rgtRef.current) {
      rgtRef.current.position.copy(posScratch);
      rgtRef.current.setDirection(rgtScratch);
    }
    readoutTick.current += dt;
    if (readoutTick.current > 0.15) {
      readoutTick.current = 0;
      if (typeof document !== "undefined") {
        const el = document.getElementById("virtudrive-debug-readout");
        if (el) {
          const hDeg = (h * 180) / Math.PI;
          const spdKmh = s.speed_mps * 3.6;
          el.textContent =
            `heading ${hDeg.toFixed(1).padStart(6)}°   ` +
            `steer ${s.steering_deg.toFixed(1).padStart(6)}°   ` +
            `spd ${spdKmh.toFixed(1).padStart(6)} km/h`;
        }
      }
    }
  });

  if (!show || !splineGeom) return null;

  return (
    <group>
      <line>
        <primitive object={splineGeom} attach="geometry" />
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.9} />
      </line>
      <arrowHelper ref={fwdRef} args={FWD_ARGS} />
      <arrowHelper ref={rgtRef} args={RGT_ARGS} />
      <group ref={carRef}>
        <axesHelper args={[2.5]} />
      </group>
    </group>
  );
}
