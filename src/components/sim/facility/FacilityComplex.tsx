import { useMemo } from "react";
import * as THREE from "three";
import type { PathSample } from "../store";
import type { TerrainSampler } from "../terrain-height";
import { hash2 } from "../textures";

/**
 * Engineering proving-ground facility.
 * A single anchored complex placed off to the side of the first road sample.
 * All buildings snap to sampler.heightAt so nothing floats or clips.
 *
 * Layout (facility-local, +X = along road heading, +Z = away from road):
 *
 *   entry plaza / gate │ parking │ main garage │ workshop
 *                                 │ tower/obs  │ lab
 *                                 │ fuel bay   │ EV bay │ inspection
 */
export function FacilityComplex({
  samples,
  sampler,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
}) {
  const anchor = useMemo(() => {
    if (samples.length < 2) return null;
    const s0 = samples[0];
    const s1 = samples[Math.min(samples.length - 1, 4)];
    const heading = Math.atan2(s1.y - s0.y, s1.x - s0.x);
    const nx = -Math.sin(heading);
    const ny = Math.cos(heading);
    // Offset 130 m to the "right" of the road start (side = +1)
    const off = 130;
    const cxSim = s0.x + nx * off;
    const cySim = s0.y + ny * off;
    const worldX = cxSim;
    const worldZ = -cySim;
    // Average local terrain height across a 60 m radius to get a level plot
    let sum = 0,
      n = 0;
    for (let dx = -40; dx <= 40; dx += 20) {
      for (let dz = -40; dz <= 40; dz += 20) {
        sum += sampler.heightAt(worldX + dx, worldZ + dz);
        n++;
      }
    }
    const groundY = n > 0 ? sum / n : 0;
    return { worldX, worldZ, groundY, heading };
  }, [samples, sampler]);

  if (!anchor) return null;

  // All buildings placed in facility-local frame (X = along road, Z = out).
  // rotation.y = -heading rotates local +X to match world road direction.
  return (
    <group
      position={[anchor.worldX, anchor.groundY, anchor.worldZ]}
      rotation={[0, -anchor.heading, 0]}
    >
      <Plot />
      <PerimeterFence />
      <GateHouse position={[-70, 0, -55]} />
      <EntryPlaza position={[-55, 0, -55]} />
      <ParkingLot position={[-30, 0, -50]} />
      <ServiceSpur />
      <MainGarage position={[10, 0, -30]} />
      <Workshop position={[45, 0, -30]} />
      <ControlTower position={[10, 0, 8]} />
      <ObservationDeck position={[10, 0, 22]} />
      <ResearchLab position={[45, 0, 5]} />
      <FuelCanopy position={[-15, 0, -5]} />
      <EVCanopy position={[-15, 0, 15]} />
      <InspectionBay position={[75, 0, -20]} />
      <FacilitySign position={[-72, 0, -70]} />
    </group>
  );
}

/* ---------- Prefabs (all real-world scale, metres) ------------------------ */

const CONCRETE = "#c3c5c8";
const CONCRETE_DARK = "#8a8d92";
const METAL_ROOF = "#3a3f47";
const WHITE_METAL = "#e6eaef";
const WINDOW = "#4c7ea8";
const YELLOW_STRIPE = "#e6c22a";

function Plot() {
  // Flattened tarmac / concrete plot the whole facility sits on
  return (
    <mesh position={[10, 0.02, -12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[180, 130]} />
      <meshStandardMaterial color="#4a4d52" roughness={0.95} />
    </mesh>
  );
}

function PerimeterFence() {
  const posts = useMemo(() => {
    const arr: Array<[number, number]> = [];
    // Rectangle: X in [-85, 100], Z in [-77, 55]
    const step = 6;
    for (let x = -85; x <= 100; x += step) {
      arr.push([x, -77]);
      arr.push([x, 55]);
    }
    for (let z = -77; z <= 55; z += step) {
      arr.push([-85, z]);
      arr.push([100, z]);
    }
    return arr;
  }, []);
  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.1, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
          <meshStandardMaterial color="#5a5f66" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {/* Chain-link visualization: 4 low-poly translucent strips */}
      {[
        { x: 7.5, z: -77, w: 185, r: 0 },
        { x: 7.5, z: 55, w: 185, r: 0 },
        { x: -85, z: -11, w: 132, r: Math.PI / 2 },
        { x: 100, z: -11, w: 132, r: Math.PI / 2 },
      ].map((f, i) => (
        <mesh key={`f${i}`} position={[f.x, 1.1, f.z]} rotation={[0, f.r, 0]}>
          <planeGeometry args={[f.w, 2.0]} />
          <meshStandardMaterial
            color="#8a8d92"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

function GateHouse({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Gate house */}
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 2.8, 3.5]} />
        <meshStandardMaterial color={WHITE_METAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <boxGeometry args={[4.4, 0.25, 3.9]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.9} />
      </mesh>
      {/* Boom barrier */}
      <mesh position={[3.5, 1.2, 0]} castShadow>
        <boxGeometry args={[0.25, 2.4, 0.25]} />
        <meshStandardMaterial color="#e63946" roughness={0.6} />
      </mesh>
      <mesh position={[6.5, 2.3, 0]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[6, 0.15, 0.15]} />
        <meshStandardMaterial color={YELLOW_STRIPE} roughness={0.5} />
      </mesh>
    </group>
  );
}

function EntryPlaza({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 20]} />
        <meshStandardMaterial color="#7d8085" roughness={0.85} />
      </mesh>
      {/* Flagpoles */}
      {[-6, 0, 6].map((x, i) => (
        <group key={i} position={[x, 0, -8]}>
          <mesh position={[0, 4, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 8, 6]} />
            <meshStandardMaterial color={WHITE_METAL} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.9, 7.2, 0]} castShadow>
            <planeGeometry args={[1.8, 1.1]} />
            <meshStandardMaterial
              color={i === 0 ? "#1a4b8a" : i === 1 ? "#d43f3f" : "#e6c22a"}
              side={THREE.DoubleSide}
              roughness={0.7}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ParkingLot({ position }: { position: [number, number, number] }) {
  const cars = useMemo(() => {
    const arr: Array<{ x: number; z: number; color: string }> = [];
    const colors = ["#c2c6cf", "#2b2f36", "#8a2a2a", "#1a3d6e", "#4a4d52", "#e0dcc8"];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 8; col++) {
        // Deterministic gaps
        if (hash2(row, col) < 0.25) continue;
        arr.push({
          x: -14 + col * 3.5,
          z: row * 6,
          color: colors[Math.floor(hash2(row * 7, col) * colors.length)],
        });
      }
    }
    return arr;
  }, []);
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 14]} />
        <meshStandardMaterial color="#3d4046" roughness={0.95} />
      </mesh>
      {/* Parking lines */}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[-15.5 + i * 3.5, 0.08, 3]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.15, 12]} />
          <meshBasicMaterial color="#f2ead0" />
        </mesh>
      ))}
      {cars.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[1.8, 1.4, 4.4]} />
            <meshStandardMaterial color={c.color} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.35, 0.2]} castShadow>
            <boxGeometry args={[1.6, 0.7, 2.4]} />
            <meshStandardMaterial color={c.color} metalness={0.3} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ServiceSpur() {
  // Decorative asphalt strip from the gate area back toward the main road
  return (
    <mesh position={[-40, 0.05, -35]} rotation={[-Math.PI / 2, 0, 0.35]} receiveShadow>
      <planeGeometry args={[90, 6]} />
      <meshStandardMaterial color="#2a2d32" roughness={0.95} />
    </mesh>
  );
}

function MainGarage({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Building shell 30×12×8 */}
      <mesh position={[0, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[30, 8, 12]} />
        <meshStandardMaterial color={WHITE_METAL} roughness={0.7} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 8.2, 0]} castShadow>
        <boxGeometry args={[30.6, 0.4, 12.6]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.85} />
      </mesh>
      {/* Roll-up doors — 4 bays */}
      {[-10, -3.3, 3.3, 10].map((x, i) => (
        <mesh key={i} position={[x, 2.3, 6.06]}>
          <planeGeometry args={[5, 4.6]} />
          <meshStandardMaterial color="#22262d" roughness={0.5} metalness={0.35} />
        </mesh>
      ))}
      {/* Signage strip */}
      <mesh position={[0, 6.8, 6.07]}>
        <planeGeometry args={[16, 1.2]} />
        <meshStandardMaterial
          color="#1a3d6e"
          emissive="#1a3d6e"
          emissiveIntensity={0.25}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

function Workshop({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[20, 6, 10]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.8} />
      </mesh>
      <mesh position={[0, 6.2, 0]} castShadow>
        <boxGeometry args={[20.4, 0.3, 10.4]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.9} />
      </mesh>
      {/* Windows */}
      {[-6, -2, 2, 6].map((x, i) => (
        <mesh key={i} position={[x, 3.6, 5.05]}>
          <planeGeometry args={[2.2, 1.6]} />
          <meshStandardMaterial
            color={WINDOW}
            emissive={WINDOW}
            emissiveIntensity={0.12}
            roughness={0.15}
            metalness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

function ControlTower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Stem */}
      <mesh position={[0, 9, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 18, 5]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.8} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 19.5, 0]} castShadow>
        <cylinderGeometry args={[4.2, 3.6, 3, 12]} />
        <meshStandardMaterial color={WHITE_METAL} roughness={0.5} />
      </mesh>
      {/* Glass ring */}
      <mesh position={[0, 19.5, 0]}>
        <cylinderGeometry args={[4.05, 4.05, 2.2, 12, 1, true]} />
        <meshStandardMaterial
          color="#5aa8e6"
          transparent
          opacity={0.55}
          roughness={0.1}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Roof antenna */}
      <mesh position={[0, 22, 0]} castShadow>
        <cylinderGeometry args={[3.6, 3.6, 0.3, 12]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.7} />
      </mesh>
      <mesh position={[0, 24.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 5, 6]} />
        <meshStandardMaterial color={WHITE_METAL} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 27.2, 0]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshStandardMaterial color="#ff2a1a" emissive="#ff5a3a" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function ObservationDeck({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 3, 6]} />
        <meshStandardMaterial color={CONCRETE_DARK} roughness={0.85} />
      </mesh>
      {/* Railing */}
      <mesh position={[0, 3.4, 3]}>
        <boxGeometry args={[14, 0.1, 0.08]} />
        <meshStandardMaterial color={WHITE_METAL} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 3.4, -3]}>
        <boxGeometry args={[14, 0.1, 0.08]} />
        <meshStandardMaterial color={WHITE_METAL} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

function ResearchLab({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[22, 8, 14]} />
        <meshStandardMaterial color="#d8dde3" roughness={0.55} />
      </mesh>
      <mesh position={[0, 8.25, 0]} castShadow>
        <boxGeometry args={[22.4, 0.5, 14.4]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.9} />
      </mesh>
      {/* Full-height glass facade */}
      <mesh position={[0, 4.5, 7.06]}>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial
          color={WINDOW}
          emissive={WINDOW}
          emissiveIntensity={0.18}
          roughness={0.1}
          metalness={0.35}
        />
      </mesh>
      {/* Solar panels on roof */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-9 + i * 3.6, 8.55, 0]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[3.2, 8]} />
          <meshStandardMaterial
            color="#1c2a44"
            metalness={0.6}
            roughness={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function FuelCanopy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Canopy roof */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[12, 0.3, 8]} />
        <meshStandardMaterial color={WHITE_METAL} roughness={0.55} />
      </mesh>
      {/* Support columns */}
      {[
        [-5, -3],
        [5, -3],
        [-5, 3],
        [5, 3],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 2.5, z]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 5, 8]} />
          <meshStandardMaterial color={WHITE_METAL} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      {/* Pumps */}
      {[-2, 2].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <boxGeometry args={[0.7, 1.6, 1.2]} />
            <meshStandardMaterial color="#d43f3f" roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[0.6, 0.25, 1.0]} />
            <meshStandardMaterial color="#22262d" roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Fuel label */}
      <mesh position={[0, 4.7, 4.05]}>
        <planeGeometry args={[6, 0.8]} />
        <meshStandardMaterial color="#d43f3f" emissive="#d43f3f" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function EVCanopy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 4.6, 0]} castShadow>
        <boxGeometry args={[12, 0.3, 8]} />
        <meshStandardMaterial color={WHITE_METAL} roughness={0.55} />
      </mesh>
      {/* Solar cells on canopy top */}
      <mesh position={[0, 4.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11.5, 7.5]} />
        <meshStandardMaterial color="#1c2a44" metalness={0.6} roughness={0.25} />
      </mesh>
      {[
        [-5, -3],
        [5, -3],
        [-5, 3],
        [5, 3],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 2.25, z]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 4.5, 8]} />
          <meshStandardMaterial color={WHITE_METAL} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      {/* Charge stations */}
      {[-3, 0, 3].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[0.5, 1.8, 0.6]} />
            <meshStandardMaterial color="#1a7a4a" roughness={0.45} />
          </mesh>
          <mesh position={[0, 1.6, 0.32]}>
            <planeGeometry args={[0.35, 0.5]} />
            <meshStandardMaterial color="#7cf29a" emissive="#7cf29a" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 4.2, 4.05]}>
        <planeGeometry args={[5, 0.8]} />
        <meshStandardMaterial color="#1a7a4a" emissive="#1a7a4a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function InspectionBay({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Building */}
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 5, 8]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.8} />
      </mesh>
      <mesh position={[0, 5.15, 0]} castShadow>
        <boxGeometry args={[10.4, 0.3, 8.4]} />
        <meshStandardMaterial color={METAL_ROOF} roughness={0.85} />
      </mesh>
      {/* Bay opening */}
      <mesh position={[0, 2, 4.05]}>
        <planeGeometry args={[4, 3.6]} />
        <meshStandardMaterial color="#101317" roughness={0.4} />
      </mesh>
      {/* Inspection pit rails on ground */}
      <mesh position={[0, 0.06, 8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 6]} />
        <meshStandardMaterial color="#22262d" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  );
}

function FacilitySign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-1.6, 1.6].map((x, i) => (
        <mesh key={i} position={[x, 1.8, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 3.6, 8]} />
          <meshStandardMaterial color={CONCRETE_DARK} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 3.4, 0]} castShadow>
        <boxGeometry args={[5, 1.6, 0.2]} />
        <meshStandardMaterial color="#1a3d6e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.4, 0.11]}>
        <planeGeometry args={[4.8, 1.4]} />
        <meshStandardMaterial color="#f4f6f8" emissive="#f4f6f8" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}
