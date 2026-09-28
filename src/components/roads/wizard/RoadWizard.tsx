import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoadMap } from "@/components/RoadMap";
import { SURFACE_TYPES, SURFACE_MU, SURFACE_LABEL, type SurfaceType } from "@/lib/roads/surface";
import { validateRoad, type CurveDraft, type SlopeDraft } from "@/lib/roads/validate";

const CATEGORIES = [
  { value: "highway", label: "Highway", road_type: "highway" },
  { value: "mountain", label: "Mountain", road_type: "mountain" },
  { value: "hairpin", label: "Hairpin", road_type: "hairpin" },
  { value: "urban", label: "Urban", road_type: "urban" },
  { value: "village", label: "Village", road_type: "village" },
  { value: "race_track", label: "Race Track", road_type: "race_track" },
  { value: "off_road", label: "Off-road", road_type: "off_road" },
  { value: "custom", label: "Custom", road_type: "highway" },
] as const;

const LENGTH_PRESETS = [1000, 2000, 3000, 5000, 8000, 10000, 20000, 50000];
const LANE_COUNTS = [1, 2, 4, 6];
const STEPS = ["Basics", "Track", "Elevation", "Curves", "Preview & Save"] as const;

const CURVE_TYPES: CurveDraft["type"][] = [
  "left",
  "right",
  "hairpin_left",
  "hairpin_right",
  "s_curve",
  "banked",
];

interface FormState {
  name: string;
  description: string;
  category: (typeof CATEGORIES)[number]["value"];
  length_m: number;
  road_width_m: number;
  lane_count: number;
  lane_width_m: number;
  shoulder_width_m: number;
  median_width_m: number;
  surface_type: SurfaceType;
  surface_mu: number;
  base_slope_deg: number;
  notes: string;
  slopes: SlopeDraft[];
  curves: CurveDraft[];
}

const INITIAL: FormState = {
  name: "",
  description: "",
  category: "highway",
  length_m: 5000,
  road_width_m: 12,
  lane_count: 2,
  lane_width_m: 3.5,
  shoulder_width_m: 1.5,
  median_width_m: 0,
  surface_type: "asphalt",
  surface_mu: SURFACE_MU.asphalt,
  base_slope_deg: 0,
  notes: "",
  slopes: [],
  curves: [
    { station: 1000, radius: 200, length_m: 300, angle_deg: 45, bank_deg: 0, type: "right" },
  ],
};

export function RoadWizard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(
    () =>
      validateRoad({
        name: f.name,
        length_m: f.length_m,
        base_slope_deg: f.base_slope_deg,
        curves: f.curves,
        slopes: f.slopes,
      }),
    [f.name, f.length_m, f.base_slope_deg, f.curves, f.slopes],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setSurface(t: SurfaceType) {
    setF((prev) => ({ ...prev, surface_type: t, surface_mu: SURFACE_MU[t] }));
  }

  function addSlope() {
    setF((prev) => ({
      ...prev,
      slopes: [
        ...prev.slopes,
        {
          direction: "uphill",
          angle_deg: 4,
          length_m: 400,
          transition_m: 100,
          bank_deg: 0,
          bank_dir: "flat",
        },
      ],
    }));
  }
  function removeSlope(i: number) {
    setF((prev) => ({ ...prev, slopes: prev.slopes.filter((_, j) => j !== i) }));
  }
  function patchSlope(i: number, patch: Partial<SlopeDraft>) {
    setF((prev) => ({
      ...prev,
      slopes: prev.slopes.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));
  }

  function addCurve() {
    const last = f.curves[f.curves.length - 1];
    const station = Math.min(f.length_m - 200, last ? last.station + last.length_m + 400 : 500);
    setF((prev) => ({
      ...prev,
      curves: [
        ...prev.curves,
        { station, radius: 150, length_m: 200, angle_deg: 60, bank_deg: 0, type: "right" },
      ],
    }));
  }
  function removeCurve(i: number) {
    setF((prev) => ({ ...prev, curves: prev.curves.filter((_, j) => j !== i) }));
  }
  function patchCurve(i: number, patch: Partial<CurveDraft>) {
    setF((prev) => ({
      ...prev,
      curves: prev.curves.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  }
  function randomizeCurves() {
    const n = 4 + Math.floor(Math.random() * 5);
    const arr: CurveDraft[] = [];
    for (let i = 0; i < n; i++) {
      const st = Math.floor((f.length_m * (i + 1)) / (n + 2));
      const radius = 40 + Math.floor(Math.random() * 260);
      const angle = 30 + Math.floor(Math.random() * 90);
      const length = Math.max(80, (radius * angle * Math.PI) / 180);
      arr.push({
        station: st,
        radius,
        length_m: Math.round(length),
        angle_deg: angle,
        bank_deg: 0,
        type: i % 2 === 0 ? "right" : "left",
      });
    }
    setF((prev) => ({ ...prev, curves: arr }));
  }

  async function save() {
    if (!validation.ok) {
      toast.error("Fix validation errors before saving.");
      setStep(STEPS.length - 1);
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const cat = CATEGORIES.find((c) => c.value === f.category)!;
      const preview_thumbnail = renderThumbnail(f.length_m, f.curves);

      const elevation_profile = buildElevationProfile(f.length_m, f.slopes, f.base_slope_deg);

      const payload = {
        owner_id: u.user.id,
        is_public: false,
        name: f.name.trim(),
        description: f.description.trim() || null,
        category: f.category,
        road_type: cat.road_type,
        length_m: f.length_m,
        surface_mu: f.surface_mu,
        surface_type: f.surface_type,
        base_slope_deg: f.base_slope_deg,
        road_width_m: f.road_width_m,
        lane_count: f.lane_count,
        lane_width_m: f.lane_width_m,
        shoulder_width_m: f.shoulder_width_m,
        median_width_m: f.median_width_m,
        curves: f.curves as unknown as never,
        slopes: f.slopes as unknown as never,
        elevation_profile: elevation_profile as unknown as never,
        notes: f.notes || null,
        preview_thumbnail,
      };

      const { data, error } = await supabase.from("roads").insert(payload).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["roads"] });
      toast.success("Road created");
      nav({ to: "/roads/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`px-3 py-2 rounded-md border ${
              i === step
                ? "border-primary text-primary bg-primary/10"
                : i < step
                  ? "border-border text-muted-foreground"
                  : "border-border/60 text-muted-foreground/70"
            }`}
          >
            <span className="mr-2 num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="panel p-6 space-y-6">
        {step === 0 && <StepBasics f={f} update={update} />}
        {step === 1 && <StepTrack f={f} update={update} setSurface={setSurface} />}
        {step === 2 && (
          <StepElevation
            f={f}
            update={update}
            addSlope={addSlope}
            removeSlope={removeSlope}
            patchSlope={patchSlope}
          />
        )}
        {step === 3 && (
          <StepCurves
            f={f}
            addCurve={addCurve}
            removeCurve={removeCurve}
            patchCurve={patchCurve}
            randomize={randomizeCurves}
          />
        )}
        {step === 4 && <StepPreview f={f} validation={validation} />}

        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" disabled={saving || !validation.ok} onClick={save}>
              <Check className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save road"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Steps ---------- */

function StepBasics({
  f,
  update,
}: {
  f: FormState;
  update: <K extends keyof FormState>(key: K, v: FormState[K]) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <Label>Road name *</Label>
        <Input
          value={f.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Alpine Loop North"
        />
      </div>
      <div>
        <Label>Category</Label>
        <Select
          value={f.category}
          onValueChange={(v) => update("category", v as FormState["category"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label>Description</Label>
        <Textarea
          rows={3}
          value={f.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Long-form description of the track, its purpose, and testing focus."
        />
      </div>
    </div>
  );
}

function StepTrack({
  f,
  update,
  setSurface,
}: {
  f: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  setSurface: (t: SurfaceType) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label>Road length</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {LENGTH_PRESETS.map((m) => (
            <Button
              key={m}
              type="button"
              variant={f.length_m === m ? "default" : "outline"}
              size="sm"
              onClick={() => update("length_m", m)}
            >
              {m >= 1000 ? `${m / 1000} km` : `${m} m`}
            </Button>
          ))}
          <Input
            type="number"
            min={500}
            step={100}
            className="w-32"
            value={f.length_m}
            onChange={(e) => update("length_m", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Lane count</Label>
          <Select
            value={String(f.lane_count)}
            onValueChange={(v) => update("lane_count", Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANE_COUNTS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} lane{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Lane width (m)</Label>
          <Input
            type="number"
            step="0.1"
            min="2"
            value={f.lane_width_m}
            onChange={(e) => update("lane_width_m", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Road width (m)</Label>
          <Input
            type="number"
            step="0.5"
            min="4"
            value={f.road_width_m}
            onChange={(e) => update("road_width_m", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Shoulder width (m)</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={f.shoulder_width_m}
            onChange={(e) => update("shoulder_width_m", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Median width (m)</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={f.median_width_m}
            onChange={(e) => update("median_width_m", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Base slope (°)</Label>
          <Input
            type="number"
            step="0.5"
            min={-20}
            max={20}
            value={f.base_slope_deg}
            onChange={(e) => update("base_slope_deg", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Road surface</Label>
          <Select value={f.surface_type} onValueChange={(v) => setSurface(v as SurfaceType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SURFACE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {SURFACE_LABEL[t]} (μ ≈ {SURFACE_MU[t]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Surface μ (override)</Label>
          <Input
            type="number"
            step="0.01"
            min="0.1"
            max="1.3"
            value={f.surface_mu}
            onChange={(e) => update("surface_mu", Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

function StepElevation({
  f,
  update,
  addSlope,
  removeSlope,
  patchSlope,
}: {
  f: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  addSlope: () => void;
  removeSlope: (i: number) => void;
  patchSlope: (i: number, patch: Partial<SlopeDraft>) => void;
}) {
  const profile = useMemo(
    () => buildElevationProfile(f.length_m, f.slopes, f.base_slope_deg),
    [f.length_m, f.slopes, f.base_slope_deg],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Slopes describe grade changes along the road. Angles are capped at 20°.
        </div>
        <Button type="button" size="sm" onClick={addSlope}>
          <Plus className="w-3 h-3 mr-1" /> Add slope
        </Button>
      </div>

      <ElevationChart profile={profile} />

      {f.slopes.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border/60 rounded-md">
          No elevation changes — road follows the base slope of {f.base_slope_deg}°.
        </div>
      ) : (
        <div className="space-y-2">
          {f.slopes.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-2"
            >
              <div className="col-span-1 pt-2 text-xs text-muted-foreground num">#{i + 1}</div>
              <div className="col-span-2">
                <Label className="text-[10px] uppercase text-muted-foreground">Direction</Label>
                <Select
                  value={s.direction}
                  onValueChange={(v) => patchSlope(i, { direction: v as SlopeDraft["direction"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uphill">Uphill</SelectItem>
                    <SelectItem value="downhill">Downhill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] uppercase text-muted-foreground">Angle (°)</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={s.angle_deg}
                  onChange={(e) => patchSlope(i, { angle_deg: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] uppercase text-muted-foreground">Length (m)</Label>
                <Input
                  type="number"
                  min={10}
                  step={10}
                  value={s.length_m}
                  onChange={(e) => patchSlope(i, { length_m: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Transition (m)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  value={s.transition_m}
                  onChange={(e) => patchSlope(i, { transition_m: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Bank (°)</Label>
                <Input
                  type="number"
                  step={0.5}
                  min={-15}
                  max={15}
                  value={s.bank_deg}
                  onChange={(e) => patchSlope(i, { bank_deg: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Bank dir</Label>
                <Select
                  value={s.bank_dir}
                  onValueChange={(v) => patchSlope(i, { bank_dir: v as SlopeDraft["bank_dir"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeSlope(i)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Label>Base slope (°)</Label>
        <Input
          type="number"
          step={0.5}
          min={-20}
          max={20}
          value={f.base_slope_deg}
          onChange={(e) => update("base_slope_deg", Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function StepCurves({
  f,
  addCurve,
  removeCurve,
  patchCurve,
  randomize,
}: {
  f: FormState;
  addCurve: () => void;
  removeCurve: (i: number) => void;
  patchCurve: (i: number, patch: Partial<CurveDraft>) => void;
  randomize: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm uppercase tracking-widest text-muted-foreground">
          Curves ({f.curves.length})
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={randomize}>
            <Shuffle className="w-3 h-3 mr-1" /> Randomize
          </Button>
          <Button type="button" size="sm" onClick={addCurve}>
            <Plus className="w-3 h-3 mr-1" /> Add curve
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-background/40 p-2">
        <RoadMap length_m={f.length_m} curves={f.curves} />
      </div>

      <div className="space-y-2">
        {f.curves.map((c, i) => (
          <div
            key={i}
            className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-2"
          >
            <div className="col-span-1 pt-2 text-xs text-muted-foreground num">#{i + 1}</div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
              <Select
                value={c.type}
                onValueChange={(v) => patchCurve(i, { type: v as CurveDraft["type"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Station (m)</Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={c.station}
                onChange={(e) => patchCurve(i, { station: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Radius (m)</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={c.radius}
                onChange={(e) => patchCurve(i, { radius: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Length (m)</Label>
              <Input
                type="number"
                min={10}
                step={10}
                value={c.length_m}
                onChange={(e) => patchCurve(i, { length_m: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Angle (°)</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={c.angle_deg}
                onChange={(e) => patchCurve(i, { angle_deg: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Bank (°)</Label>
              <Input
                type="number"
                step={0.5}
                min={-15}
                max={15}
                value={c.bank_deg}
                onChange={(e) => patchCurve(i, { bank_deg: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-1">
              <Button type="button" variant="destructive" size="sm" onClick={() => removeCurve(i)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepPreview({
  f,
  validation,
}: {
  f: FormState;
  validation: ReturnType<typeof validateRoad>;
}) {
  const profile = useMemo(
    () => buildElevationProfile(f.length_m, f.slopes, f.base_slope_deg),
    [f.length_m, f.slopes, f.base_slope_deg],
  );
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-widest mb-2">
            Top-down
          </div>
          <RoadMap length_m={f.length_m} curves={f.curves} />
        </div>
        <div className="panel p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-widest mb-2">
            Elevation profile
          </div>
          <ElevationChart profile={profile} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-4">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{f.name || "—"}</dd>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{f.category}</dd>
            <dt className="text-muted-foreground">Length</dt>
            <dd className="num">{(f.length_m / 1000).toFixed(2)} km</dd>
            <dt className="text-muted-foreground">Surface</dt>
            <dd>
              {SURFACE_LABEL[f.surface_type]} (μ {f.surface_mu})
            </dd>
            <dt className="text-muted-foreground">Lanes</dt>
            <dd>
              {f.lane_count} × {f.lane_width_m} m
            </dd>
            <dt className="text-muted-foreground">Curves</dt>
            <dd className="num">{f.curves.length}</dd>
            <dt className="text-muted-foreground">Slopes</dt>
            <dd className="num">{f.slopes.length}</dd>
          </dl>
        </div>
      </div>

      <div className="panel p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          {validation.ok ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Engineering validation passed.
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-red-500" /> {validation.errors.length} issue
              {validation.errors.length === 1 ? "" : "s"} to fix.
            </>
          )}
        </div>
        {validation.errors.length > 0 && (
          <ul className="text-xs text-red-400 list-disc pl-5 space-y-0.5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {validation.warnings.length > 0 && (
          <ul className="text-xs text-amber-400 list-disc pl-5 space-y-0.5">
            {validation.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

interface ElevationSample {
  s: number;
  z: number;
}

function buildElevationProfile(
  length_m: number,
  slopes: SlopeDraft[],
  baseSlopeDeg: number,
): ElevationSample[] {
  const step = Math.max(20, length_m / 200);
  const n = Math.ceil(length_m / step) + 1;
  const samples: ElevationSample[] = [];
  let z = 0;
  let s = 0;
  const base = Math.tan((baseSlopeDeg * Math.PI) / 180);
  // Precompute slope segment ranges, laid end-to-end starting at s=0.
  const ranges: Array<{ start: number; end: number; slope: number; trans: number }> = [];
  let cursor = 0;
  for (const sl of slopes) {
    const grade = Math.tan((sl.angle_deg * Math.PI) / 180) * (sl.direction === "uphill" ? 1 : -1);
    ranges.push({ start: cursor, end: cursor + sl.length_m, slope: grade, trans: sl.transition_m });
    cursor += sl.length_m + sl.transition_m;
  }
  for (let i = 0; i < n; i++) {
    let grade = base;
    for (const r of ranges) {
      if (s >= r.start && s <= r.end) {
        grade = r.slope;
        break;
      }
      // linear transition after the segment
      if (s > r.end && s <= r.end + r.trans) {
        const t = (s - r.end) / r.trans;
        grade = r.slope * (1 - t) + base * t;
        break;
      }
    }
    z += grade * step;
    samples.push({ s, z });
    s += step;
  }
  return samples;
}

function ElevationChart({ profile }: { profile: ElevationSample[] }) {
  if (profile.length < 2) return null;
  const w = 700,
    h = 160,
    pad = 20;
  const maxS = profile[profile.length - 1].s;
  const zs = profile.map((p) => p.z);
  const minZ = Math.min(...zs, 0);
  const maxZ = Math.max(...zs, 1);
  const spanZ = maxZ - minZ || 1;
  const pts = profile
    .map((p) => {
      const x = pad + (p.s / maxS) * (w - pad * 2);
      const y = h - pad - ((p.z - minZ) / spanZ) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <rect width={w} height={h} fill="oklch(0.18 0.02 240 / 0.4)" />
      <polyline fill="none" stroke="oklch(0.78 0.14 195)" strokeWidth={2} points={pts} />
      <text x={pad} y={14} className="text-[10px] fill-muted-foreground">
        Δz {(maxZ - minZ).toFixed(1)} m over {(maxS / 1000).toFixed(2)} km
      </text>
    </svg>
  );
}

function renderThumbnail(length_m: number, curves: CurveDraft[]): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const W = 320,
    H = 180;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const step = 5;
  const n = Math.ceil(length_m / step) + 1;
  let x = 0,
    y = 0,
    hh = 0;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const s = i * step;
    pts.push([x, y]);
    let radius = 0;
    for (const c of curves) {
      const arcLen = (c.radius * c.angle_deg * Math.PI) / 180;
      if (s >= c.station && s <= c.station + arcLen) {
        radius = c.radius;
        break;
      }
    }
    const kappa = radius ? 1 / radius : 0;
    hh += kappa * step;
    x += Math.cos(hh) * step;
    y += Math.sin(hh) * step;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min((W - 20) / (maxX - minX || 1), (H - 20) / (maxY - minY || 1));
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#66e0d0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const cx = (px - minX) * scale + 10;
    const cy = (py - minY) * scale + 10;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
  return canvas.toDataURL("image/png");
}
