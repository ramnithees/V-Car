import { useMemo } from "react";
import * as THREE from "three";
import {
  paintMat,
  matteBlackMat,
  pianoBlackMat,
  glassMat,
  chromeMat,
  rimMat,
  makeEmissive,
} from "./materials";

/**
 * Engineering-grade compact SUV body (Phase 12 redesign).
 *
 * Silhouette inspired by Tesla Model Y / Rivian R1S / Hyundai Tucson /
 * Mahindra XUV700 — original geometry, not a copy of any single model.
 * Built entirely from low-poly primitives so WebGL cost stays flat and
 * the surface reads as a real SUV under any lighting preset.
 *
 * Physics-critical anchors preserved (do NOT change):
 *   overall length ≈ 4.10, width ≈ 1.72          (Vehicle.tsx)
 *   wheels at |x| = 0.85, wheelbase = 2.70       (Vehicle.tsx)
 *   Lights.tsx anchors at Z = ±2.06              (Lights.tsx)
 *
 * The greenhouse is raised (SUV-tall) but the chassis frame origin and
 * wheel-well cutouts are unchanged, so ride height / suspension travel /
 * camera framing continue to work as before.
 *
 * Local frame (inside chassis group): +X right, +Y up, +Z rear.
 */

const LENGTH = 4.1;
const WIDTH = 1.72;
const HALF_W = WIDTH / 2;
const FRONT_Z = -LENGTH / 2; // -2.05
const REAR_Z = LENGTH / 2; //  2.05

// SUV proportions — taller box, upright glass, prominent shoulders.
const ROCKER_Y = -0.22; // bottom of body (matte cladding starts here)
const SHOULDER_Y = 0.62; // top of lower body / bottom of greenhouse
const ROOF_Y = 1.14; // roof plane (SUV-tall)
const ROOF_FRONT_Z = -0.35;
const ROOF_REAR_Z = 1.05;
const CABIN_FRONT_Z = -0.85;
const CABIN_REAR_Z = 1.35;

/** Rounded-rectangle plan-view slab extruded along +Y with bevelled edges. */
function roundedSlab(
  lengthZ: number,
  widthX: number,
  height: number,
  radius: number,
  bevel = 0.04,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const w = widthX / 2;
  const l = lengthZ / 2;
  const r = Math.min(radius, w - 0.01, l - 0.01);
  s.moveTo(-w + r, -l);
  s.lineTo(w - r, -l);
  s.quadraticCurveTo(w, -l, w, -l + r);
  s.lineTo(w, l - r);
  s.quadraticCurveTo(w, l, w - r, l);
  s.lineTo(-w + r, l);
  s.quadraticCurveTo(-w, l, -w, l - r);
  s.lineTo(-w, -l + r);
  s.quadraticCurveTo(-w, -l, -w + r, -l);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: height,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Trapezoidal roof plan slab (front narrower than rear = SUV taper). */
function tapezRoofSlab(
  frontZ: number,
  rearZ: number,
  frontW: number,
  rearW: number,
  height: number,
  radius: number,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const fw = frontW / 2;
  const rw = rearW / 2;
  const r = radius;
  s.moveTo(-fw + r, frontZ);
  s.lineTo(fw - r, frontZ);
  s.quadraticCurveTo(fw, frontZ, fw + (rw - fw) * (r / (rearZ - frontZ)), frontZ + r);
  s.lineTo(rw, rearZ - r);
  s.quadraticCurveTo(rw, rearZ, rw - r, rearZ);
  s.lineTo(-rw + r, rearZ);
  s.quadraticCurveTo(-rw, rearZ, -rw, rearZ - r);
  s.lineTo(-fw - (rw - fw) * (r / (rearZ - frontZ)), frontZ + r);
  s.quadraticCurveTo(-fw, frontZ, -fw + r, frontZ);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: height,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function Body({ color = "#1fb3a0" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  // Lower body shell — full-length rounded slab.
  const lowerGeo = useMemo(() => roundedSlab(LENGTH, WIDTH, SHOULDER_Y - ROCKER_Y, 0.3, 0.06), []);

  // Roof panel — SUV: nearly flat, gentle front taper.
  const roofGeo = useMemo(
    () => tapezRoofSlab(ROOF_FRONT_Z, ROOF_REAR_Z, 1.52, 1.6, 0.05, 0.14),
    [],
  );

  // Raised hood surface with subtle power dome.
  const hoodGeo = useMemo(() => roundedSlab(1.55, 1.5, 0.05, 0.18, 0.02), []);

  // Wheel-well liners (matte tunnel across each axle).
  const linerGeo = useMemo(
    () => new THREE.CylinderGeometry(0.46, 0.46, WIDTH - 0.04, 20, 1, true, 0, Math.PI),
    [],
  );

  // Baked DRL / tail strip emissives (Lights.tsx drives the dynamic ones).
  const drlMat = useMemo(() => makeEmissive("#eaf5ff", 0.6), []);
  const tailMat = useMemo(() => makeEmissive("#ff2222", 0.4), []);
  const sensorGlow = useMemo(() => makeEmissive("#66e0ff", 0.9), []);

  // Angled glass panel geometry helper.
  const glassPanel = (w: number, h: number, thickness = 0.02) =>
    new THREE.BoxGeometry(w, h, thickness);

  const windshieldGeo = useMemo(
    () => glassPanel(1.52, Math.hypot(ROOF_FRONT_Z - CABIN_FRONT_Z, ROOF_Y - SHOULDER_Y)),
    [],
  );
  const rearGlassGeo = useMemo(
    () => glassPanel(1.54, Math.hypot(CABIN_REAR_Z - ROOF_REAR_Z, ROOF_Y - SHOULDER_Y)),
    [],
  );

  // Windshield tilt.
  const wsDZ = ROOF_FRONT_Z - CABIN_FRONT_Z;
  const wsDY = ROOF_Y - SHOULDER_Y;
  const wsAngle = Math.atan2(wsDZ, wsDY);
  const wsCenter: [number, number, number] = [
    0,
    (SHOULDER_Y + ROOF_Y) / 2,
    (CABIN_FRONT_Z + ROOF_FRONT_Z) / 2,
  ];

  // Rear glass tilt — SUVs are much more upright than sedans.
  const rgDZ = ROOF_REAR_Z - CABIN_REAR_Z;
  const rgDY = ROOF_Y - SHOULDER_Y;
  const rgAngle = Math.atan2(rgDZ, rgDY);
  const rgCenter: [number, number, number] = [
    0,
    (SHOULDER_Y + ROOF_Y) / 2,
    (CABIN_REAR_Z + ROOF_REAR_Z) / 2,
  ];

  // Side windows — 2 per side (front door + rear door), tall SUV proportion.
  const sideWindowH = 0.44;
  const sideWinFront = { zc: -0.35, len: 0.82 };
  const sideWinRear = { zc: 0.55, len: 0.82 };
  const sideWinY = SHOULDER_Y + sideWindowH / 2 + 0.03;

  const pillarBox = (t: number, h: number, len: number) => new THREE.BoxGeometry(t, h, len);

  const aPillarLen = Math.hypot(ROOF_FRONT_Z - CABIN_FRONT_Z, ROOF_Y - SHOULDER_Y);
  const cPillarLen = Math.hypot(CABIN_REAR_Z - ROOF_REAR_Z, ROOF_Y - SHOULDER_Y);

  return (
    <group>
      {/* ── Lower body shell (main painted volume) ────────────────── */}
      <mesh
        geometry={lowerGeo}
        material={bodyMat}
        position={[0, ROCKER_Y, 0]}
        castShadow
        receiveShadow
      />

      {/* Raised hood surface with power dome */}
      <mesh
        geometry={hoodGeo}
        material={bodyMat}
        position={[0, SHOULDER_Y - 0.02, -1.2]}
        castShadow
      />

      {/* ── Wheel-well liners (matte tunnel across each axle) ────── */}
      {[-1.35, 1.35].map((z) => (
        <mesh
          key={`liner-${z}`}
          position={[0, 0.02, z]}
          rotation={[0, 0, Math.PI / 2]}
          geometry={linerGeo}
          material={matteBlackMat}
        />
      ))}

      {/* ── Fender flare cladding (SUV visual cue) ────────────────── */}
      {[-1.35, 1.35].flatMap((z) =>
        [-1, 1].map((sx) => (
          <mesh
            key={`flare-${sx}-${z}`}
            position={[sx * (HALF_W - 0.01), 0.06, z]}
            material={matteBlackMat}
            castShadow
          >
            <boxGeometry args={[0.06, 0.36, 0.98]} />
          </mesh>
        )),
      )}

      {/* ── Rocker / lower door cladding (matte black, full-length) ── */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`rocker-${sx}`}
          position={[sx * (HALF_W + 0.005), ROCKER_Y + 0.16, 0]}
          material={matteBlackMat}
        >
          <boxGeometry args={[0.03, 0.18, 3.1]} />
        </mesh>
      ))}

      {/* ── Roof panel ────────────────────────────────────────────── */}
      <mesh geometry={roofGeo} material={bodyMat} position={[0, ROOF_Y, 0]} castShadow />

      {/* ── Roof rails (silver, along both sides of the roof) ────── */}
      {[-1, 1].map((sx) => (
        <group key={`rail-${sx}`}>
          <mesh position={[sx * 0.72, ROOF_Y + 0.04, 0.32]} material={chromeMat} castShadow>
            <boxGeometry args={[0.045, 0.035, 1.4]} />
          </mesh>
          {/* Rail feet */}
          {[-0.45, 0.15, 0.85].map((z) => (
            <mesh
              key={`rail-foot-${sx}-${z}`}
              position={[sx * 0.72, ROOF_Y + 0.015, z]}
              material={pianoBlackMat}
            >
              <boxGeometry args={[0.055, 0.03, 0.1]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ── Roof-mounted LiDAR / autonomous sensor pod (compact) ─── */}
      <group position={[0, ROOF_Y + 0.035, -0.18]}>
        <mesh material={pianoBlackMat} castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.05, 20]} />
        </mesh>
        <mesh position={[0, 0.032, 0]} material={sensorGlow}>
          <cylinderGeometry args={[0.055, 0.065, 0.018, 20]} />
        </mesh>
        <mesh position={[0, 0.05, 0]} material={chromeMat}>
          <cylinderGeometry args={[0.028, 0.028, 0.012, 12]} />
        </mesh>
      </group>

      {/* ── Compact front-view camera pod (behind windshield top) ── */}
      <mesh position={[0, ROOF_Y - 0.015, ROOF_FRONT_Z + 0.03]} material={pianoBlackMat}>
        <boxGeometry args={[0.14, 0.03, 0.06]} />
      </mesh>

      {/* ── Windshield ────────────────────────────────────────────── */}
      <mesh
        geometry={windshieldGeo}
        material={glassMat}
        position={wsCenter}
        rotation={[wsAngle, 0, 0]}
      />
      {/* ── Rear glass (upright SUV tailgate) ─────────────────────── */}
      <mesh
        geometry={rearGlassGeo}
        material={glassMat}
        position={rgCenter}
        rotation={[rgAngle, 0, 0]}
      />

      {/* ── Side windows (front & rear door, taller SUV proportion) ── */}
      {[-1, 1].map((sx) => (
        <group key={`sw-${sx}`}>
          <mesh
            position={[sx * (HALF_W - 0.02), sideWinY, sideWinFront.zc]}
            rotation={[0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={glassMat}
          >
            <boxGeometry args={[sideWinFront.len, sideWindowH, 0.015]} />
          </mesh>
          <mesh
            position={[sx * (HALF_W - 0.02), sideWinY, sideWinRear.zc]}
            rotation={[0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={glassMat}
          >
            <boxGeometry args={[sideWinRear.len, sideWindowH, 0.015]} />
          </mesh>
        </group>
      ))}

      {/* ── A / B / C pillars (piano-black, framing all windows) ── */}
      {[-1, 1].map((sx) => (
        <group key={`pillars-${sx}`}>
          <mesh
            geometry={pillarBox(0.055, 0.08, aPillarLen)}
            material={pianoBlackMat}
            position={[
              sx * (HALF_W - 0.06),
              (SHOULDER_Y + ROOF_Y) / 2,
              (CABIN_FRONT_Z + ROOF_FRONT_Z) / 2,
            ]}
            rotation={[wsAngle, 0, 0]}
          />
          <mesh
            geometry={pillarBox(0.055, ROOF_Y - SHOULDER_Y, 0.11)}
            material={pianoBlackMat}
            position={[sx * (HALF_W - 0.02), (SHOULDER_Y + ROOF_Y) / 2, 0.1]}
          />
          <mesh
            geometry={pillarBox(0.06, 0.08, cPillarLen)}
            material={pianoBlackMat}
            position={[
              sx * (HALF_W - 0.06),
              (SHOULDER_Y + ROOF_Y) / 2,
              (CABIN_REAR_Z + ROOF_REAR_Z) / 2,
            ]}
            rotation={[rgAngle, 0, 0]}
          />
          {/* D-pillar cap at rear corner */}
          <mesh
            position={[sx * (HALF_W - 0.03), ROOF_Y - 0.04, ROOF_REAR_Z - 0.02]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.06, 0.1, 0.14]} />
          </mesh>
        </group>
      ))}

      {/* ── Beltline chrome accent ────────────────────────────────── */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`belt-${sx}`}
          position={[sx * (HALF_W + 0.001), SHOULDER_Y + 0.01, 0.1]}
          material={chromeMat}
        >
          <boxGeometry args={[0.012, 0.014, 2.2]} />
        </mesh>
      ))}

      {/* ── Front fascia: wide upper grille + lower intake ─────── */}
      <mesh position={[0, 0.28, FRONT_Z + 0.03]} material={matteBlackMat}>
        <boxGeometry args={[1.24, 0.16, 0.04]} />
      </mesh>
      {/* Grille horizontal slats (3) */}
      {[-0.05, 0.0, 0.05].map((dy, i) => (
        <mesh key={`slat-${i}`} position={[0, 0.28 + dy, FRONT_Z + 0.045]} material={chromeMat}>
          <boxGeometry args={[1.22, 0.008, 0.02]} />
        </mesh>
      ))}
      {/* Manufacturer badge (chrome disc) */}
      <mesh
        position={[0, 0.28, FRONT_Z + 0.06]}
        rotation={[Math.PI / 2, 0, 0]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.055, 0.055, 0.015, 16]} />
      </mesh>
      {/* Lower air intake */}
      <mesh position={[0, -0.02, FRONT_Z + 0.045]} material={matteBlackMat}>
        <boxGeometry args={[1.5, 0.16, 0.04]} />
      </mesh>
      {/* Front skid plate (silver underbody protection) */}
      <mesh position={[0, ROCKER_Y + 0.02, FRONT_Z + 0.1]} material={chromeMat} castShadow>
        <boxGeometry args={[1.2, 0.05, 0.24]} />
      </mesh>
      {/* Baked DRL bar just above the grille */}
      <mesh position={[0, 0.42, FRONT_Z + 0.045]} material={drlMat}>
        <boxGeometry args={[1.3, 0.02, 0.02]} />
      </mesh>
      {/* Front-corner camera sensors (autonomous) */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`fcam-${sx}`}
          position={[sx * (HALF_W - 0.02), 0.32, FRONT_Z + 0.06]}
          material={pianoBlackMat}
        >
          <boxGeometry args={[0.06, 0.04, 0.04]} />
        </mesh>
      ))}

      {/* ── Rear fascia: tail strip, diffuser, plate, skid plate ── */}
      <mesh position={[0, 0.44, REAR_Z - 0.02]} material={tailMat}>
        <boxGeometry args={[1.52, 0.06, 0.02]} />
      </mesh>
      {/* Rear diffuser */}
      <mesh position={[0, ROCKER_Y + 0.05, REAR_Z - 0.05]} material={matteBlackMat}>
        <boxGeometry args={[1.44, 0.1, 0.14]} />
      </mesh>
      {/* Rear skid plate */}
      <mesh position={[0, ROCKER_Y + 0.02, REAR_Z - 0.1]} material={chromeMat} castShadow>
        <boxGeometry args={[1.1, 0.05, 0.2]} />
      </mesh>
      {/* License plate recess */}
      <mesh position={[0, 0.22, REAR_Z - 0.01]} material={matteBlackMat}>
        <boxGeometry args={[0.44, 0.11, 0.02]} />
      </mesh>
      {/* Fuel / charge port cap (piano black flush panel, driver side) */}
      <mesh position={[HALF_W + 0.002, 0.28, 1.55]} material={pianoBlackMat}>
        <boxGeometry args={[0.01, 0.16, 0.16]} />
      </mesh>

      {/* ── Door handles (flush, 2 per side) ───────────────────── */}
      {[-1, 1].flatMap((sx) =>
        [-0.35, 0.55].map((z) => (
          <mesh
            key={`hdl-${sx}-${z}`}
            position={[sx * (HALF_W + 0.005), SHOULDER_Y - 0.16, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={chromeMat}
          >
            <capsuleGeometry args={[0.014, 0.12, 4, 8]} />
          </mesh>
        )),
      )}

      {/* ── Side mirrors (larger SUV pods on the A-pillar base) ── */}
      {[-1, 1].map((sx) => (
        <group key={`mir-${sx}`} position={[sx * (HALF_W + 0.08), SHOULDER_Y + 0.05, -0.7]}>
          <mesh material={bodyMat} castShadow>
            <boxGeometry args={[0.12, 0.09, 0.16]} />
          </mesh>
          {/* Mirror glass face */}
          <mesh
            position={[sx * 0.062, 0.005, 0]}
            rotation={[0, sx * 0.15, 0]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.006, 0.075, 0.12]} />
          </mesh>
          {/* Mirror stalk */}
          <mesh position={[-sx * 0.06, -0.03, 0]} rotation={[0, 0, sx * 0.35]} material={bodyMat}>
            <cylinderGeometry args={[0.02, 0.024, 0.09, 10]} />
          </mesh>
          {/* Side-view camera bump under mirror (autonomous) */}
          <mesh position={[sx * 0.02, -0.05, 0.02]} material={pianoBlackMat}>
            <boxGeometry args={[0.04, 0.03, 0.05]} />
          </mesh>
        </group>
      ))}

      {/* ── Shark-fin antenna ──────────────────────────────────── */}
      <mesh position={[0, ROOF_Y + 0.05, 0.75]} material={pianoBlackMat}>
        <coneGeometry args={[0.05, 0.1, 12]} />
      </mesh>

      {/* ── Panoramic sunroof (tinted glass inlay, centred on roof) ── */}
      <mesh position={[0, ROOF_Y + 0.032, 0.3]} material={glassMat}>
        <boxGeometry args={[0.78, 0.006, 0.7]} />
      </mesh>
      {/* Sunroof surround trim */}
      <mesh position={[0, ROOF_Y + 0.028, 0.3]} material={pianoBlackMat}>
        <boxGeometry args={[0.84, 0.004, 0.76]} />
      </mesh>

      {/* ── Windshield wipers (two, resting on the cowl) ───────── */}
      {[-0.3, 0.3].map((x) => (
        <mesh
          key={`wip-${x}`}
          position={[x, SHOULDER_Y + 0.03, CABIN_FRONT_Z + 0.02]}
          rotation={[0, 0, 0.15 * Math.sign(x)]}
          material={pianoBlackMat}
        >
          <boxGeometry args={[0.02, 0.01, 0.42]} />
        </mesh>
      ))}

      {/* ── Rear spoiler (roof-integrated lip over tailgate) ───── */}
      <mesh
        position={[0, ROOF_Y + 0.02, ROOF_REAR_Z + 0.02]}
        rotation={[-0.15, 0, 0]}
        material={bodyMat}
        castShadow
      >
        <boxGeometry args={[1.48, 0.03, 0.22]} />
      </mesh>

      {/* Silence unused import warning while keeping the palette centralised. */}
      <mesh visible={false} material={rimMat}>
        <boxGeometry args={[0.001, 0.001, 0.001]} />
      </mesh>
    </group>
  );
}
