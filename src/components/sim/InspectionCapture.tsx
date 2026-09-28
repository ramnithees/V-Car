import { useState } from "react";
import { Camera, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  captureInspectionSheet,
  composeContactSheet,
  downloadDataUrl,
  buildShotList,
  type InspectionShot,
} from "./capture";

/**
 * Automated multi-angle capture: cycles the playback camera through every
 * inspection angle at several timeline stations, grabs each rendered frame,
 * and presents them as a reviewable contact sheet (corridor clearance +
 * vehicle grounding verification for the current run).
 */
export function InspectionCapture() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [shots, setShots] = useState<InspectionShot[]>([]);
  const [active, setActive] = useState<InspectionShot | null>(null);

  const run = async () => {
    if (busy) return;
    const list = buildShotList();
    setBusy(true);
    setShots([]);
    setDone(0);
    setTotal(list.length);
    setOpen(true);
    try {
      const result = await captureInspectionSheet(list, (d, t) => {
        setDone(d);
        setTotal(t);
      });
      setShots(result);
    } finally {
      setBusy(false);
    }
  };

  const downloadSheet = async () => {
    const url = await composeContactSheet(shots);
    if (url) downloadDataUrl(url, `virtudrive-inspection-${Date.now()}.png`);
  };

  return (
    <>
      <button
        onClick={run}
        aria-label="Capture inspection sheet"
        title="Capture multi-angle inspection sheet"
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/90 backdrop-blur px-2.5 py-2 text-[11px] sm:text-xs font-medium text-foreground hover:bg-muted"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        <span className="hidden sm:inline">Inspect</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Multi-angle inspection sheet</DialogTitle>
            <DialogDescription>
              Chase, driver, front, side, top and drone frames captured across the timeline — check
              corridor clearance (top/drone) and vehicle grounding (side/front).
            </DialogDescription>
          </DialogHeader>

          {busy && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Capturing frame {done} / {total}…
              </p>
              <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {!busy && shots.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{shots.length} frames captured</p>
                <div className="flex gap-2">
                  <button
                    onClick={run}
                    className="text-xs px-3 py-2 rounded border border-border hover:bg-muted"
                  >
                    Re-capture
                  </button>
                  <button
                    onClick={downloadSheet}
                    className="text-xs px-3 py-2 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download sheet
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shots.map((s) => (
                  <figure
                    key={s.id}
                    className="rounded border border-border overflow-hidden bg-muted/30"
                  >
                    <button onClick={() => setActive(s)} className="block w-full">
                      <img
                        src={s.dataUrl}
                        alt={`${s.label} playback frame`}
                        loading="lazy"
                        className="w-full aspect-video object-cover"
                      />
                    </button>
                    <figcaption className="px-2 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                      <span className="truncate">{s.label}</span>
                      <button
                        className="hover:text-foreground"
                        aria-label={`Download ${s.label}`}
                        onClick={() => downloadDataUrl(s.dataUrl, `${s.id}.png`)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}

          {!busy && shots.length === 0 && (
            <p className="text-xs text-muted-foreground">No frames captured.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{active?.label}</DialogTitle>
          </DialogHeader>
          {active && (
            <img
              src={active.dataUrl}
              alt={`${active.label} full frame`}
              className="w-full rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
