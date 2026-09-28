import { usePlayback, type CameraMode } from "./store";

export interface InspectionShot {
  id: string;
  label: string;
  camera: CameraMode;
  progress: number;
  dataUrl: string;
}

export interface ShotSpec {
  camera: CameraMode;
  progress: number;
  label: string;
}

/** Angles chosen to expose corridor clearance + vehicle grounding defects. */
export const DEFAULT_ANGLES: { camera: CameraMode; label: string }[] = [
  { camera: "chase", label: "Chase" },
  { camera: "driver", label: "Driver" },
  { camera: "front", label: "Front" },
  { camera: "side", label: "Side (grounding)" },
  { camera: "top", label: "Top (corridor)" },
  { camera: "drone", label: "Drone" },
];

/** Timeline stations sampled for every angle. */
export const DEFAULT_STATIONS = [0.05, 0.35, 0.65, 0.95];

export function buildShotList(angles = DEFAULT_ANGLES, stations = DEFAULT_STATIONS): ShotSpec[] {
  const out: ShotSpec[] = [];
  for (const p of stations) {
    for (const a of angles) {
      out.push({ camera: a.camera, progress: p, label: `${a.label} — ${Math.round(p * 100)}%` });
    }
  }
  return out;
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      if (++i >= n) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Largest mounted canvas = the R3F playback surface. */
function playbackCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  document.querySelectorAll<HTMLCanvasElement>("canvas").forEach((c) => {
    const a = c.width * c.height;
    if (a > bestArea) {
      best = c;
      bestArea = a;
    }
  });
  return best;
}

/**
 * Drive the playback store through every (angle × station) combination and
 * grab the rendered frame. Restores the user's original camera/progress/play
 * state when finished.
 */
export async function captureInspectionSheet(
  shots: ShotSpec[] = buildShotList(),
  onProgress?: (done: number, total: number) => void,
): Promise<InspectionShot[]> {
  const store = usePlayback.getState();
  const restore = {
    cameraMode: store.cameraMode,
    progress: store.progress,
    playing: store.playing,
  };

  const results: InspectionShot[] = [];
  usePlayback.setState({ playing: false });

  try {
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      usePlayback.setState({ cameraMode: shot.camera, progress: shot.progress, playing: false });
      // let camera easing settle, then render at least one clean frame
      await nextFrames(24);
      const cvs = playbackCanvas();
      const dataUrl = cvs ? cvs.toDataURL("image/png") : "";
      if (dataUrl) {
        results.push({
          id: `${shot.camera}-${shot.progress}`,
          label: shot.label,
          camera: shot.camera,
          progress: shot.progress,
          dataUrl,
        });
      }
      onProgress?.(i + 1, shots.length);
    }
  } finally {
    usePlayback.setState(restore);
  }

  return results;
}

/** Compose captured frames into a single labelled contact sheet PNG. */
export async function composeContactSheet(
  shots: InspectionShot[],
  opts: { columns?: number; cellWidth?: number } = {},
): Promise<string | null> {
  if (!shots.length) return null;
  const cols = opts.columns ?? 3;
  const cellW = opts.cellWidth ?? 640;

  const images = await Promise.all(
    shots.map(
      (s) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = s.dataUrl;
        }),
    ),
  );

  const aspect = images[0].height / images[0].width || 9 / 16;
  const cellH = Math.round(cellW * aspect);
  const labelH = 30;
  const pad = 12;
  const headerH = 60;
  const rows = Math.ceil(shots.length / cols);

  const cvs = document.createElement("canvas");
  cvs.width = cols * cellW + pad * (cols + 1);
  cvs.height = headerH + rows * (cellH + labelH + pad) + pad;
  const ctx = cvs.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 24px sans-serif";
  ctx.fillText("VirtuDrive AI - 3D Playback Inspection Sheet", pad, 34);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px sans-serif";
  ctx.fillText(new Date().toLocaleString(), pad, 52);

  images.forEach((img, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = pad + c * (cellW + pad);
    const y = headerH + pad + r * (cellH + labelH + pad);
    ctx.drawImage(img, x, y, cellW, cellH);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellW, cellH);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 16px sans-serif";
    ctx.fillText(shots[i].label, x, y + cellH + 20);
  });

  return cvs.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
