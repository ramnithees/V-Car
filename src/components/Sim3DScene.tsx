import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { PerspectiveCamera, Environment as DreiEnvironment } from "@react-three/drei";
import { useEffect } from "react";
import { usePlayback, type PathSample } from "./sim/store";
import { Vehicle } from "./sim/Vehicle";
import { Road } from "./sim/Road";
import { SimEnvironment } from "./sim/Environment";
import { Cameras } from "./sim/Cameras";
import { SceneAdvancer } from "./sim/SceneAdvancer";
import { PlaybackControls } from "./sim/PlaybackControls";

import { PerfProbe } from "./sim/PerfProbe";
import { PerfOverlay } from "./sim/PerfOverlay";
import { DebugOverlay } from "./sim/DebugOverlay";
import { TelemetryOverlay } from "./sim/TelemetryOverlay";
import { InstrumentCluster } from "./sim/vehicle/Cluster";

export type { PathSample } from "./sim/store";

/**
 * Sim3DScene — orchestrator.
 * Componentised:
 *  - Physics / motion source of truth  → sim/store (Zustand)
 *  - Vehicle Controller                → Vehicle
 *  - Road Manager                      → Road
 *  - Environment                       → SimEnvironment
 *  - Camera Manager                    → Cameras
 *  - Playback / Simulation Controller  → SceneAdvancer + PlaybackControls
 */
export function Sim3DScene({
  samples,
  vehicleColor,
}: {
  samples: PathSample[];
  vehicleColor?: string;
}) {
  const setSamples = usePlayback((s) => s.setSamples);
  const fov = usePlayback((s) => s.fov);
  const showDebug = usePlayback((s) => s.showDebug);

  useEffect(() => {
    setSamples(samples);
  }, [samples, setSamples]);

  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            // eslint-disable-next-line no-console
            console.warn("[Sim3D] WebGL context lost");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            // eslint-disable-next-line no-console
            console.warn("[Sim3D] WebGL context restored");
          });
        }}
      >
        <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={fov} near={0.1} far={4000} />
        <color attach="background" args={["#a8c3dc"]} />
        <fog attach="fog" args={["#b6cce0", 380, 1700]} />
        {/* Base lights so scene is visible even if HDR env fails to load */}
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#cfe3ff", "#3a3a2a", 0.55]} />
        <directionalLight
          castShadow
          position={[120, 180, 60]}
          intensity={1.55}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={600}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
          shadow-bias={-0.0004}
          shadow-radius={4}
        />
        {/* Isolate any suspense-throwing loader so it can't blank the scene */}
        <Suspense fallback={null}>
          <DreiEnvironment preset="park" environmentIntensity={0.6} />
        </Suspense>
        <Suspense fallback={null}>
          <SimEnvironment samples={samples} />
        </Suspense>
        {/* useFrame order = JSX order at priority 0: advance → vehicle → cameras */}
        <SceneAdvancer />
        <Road samples={samples} />
        <Vehicle color={vehicleColor} />
        <PerfProbe />
        <DebugOverlay samples={samples} />
        <Cameras />
      </Canvas>

      <PerfOverlay />
      <TelemetryOverlay />
      <InstrumentCluster />
      <PlaybackControls />

      {showDebug && (
        <div
          id="virtudrive-debug-readout"
          className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-card/85 backdrop-blur border border-border rounded px-3 py-1.5 text-[11px] font-mono tabular-nums text-muted-foreground pointer-events-none"
        />
      )}
    </div>
  );
}
