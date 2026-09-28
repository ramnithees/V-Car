import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  BRAKE_TYPES,
  CATEGORIES,
  DIFFERENTIALS,
  DRIVE_LAYOUTS,
  ENGINE_TYPES,
  FUELS,
  INITIAL,
  TIRE_TYPES,
  TRANSMISSION_TYPES,
  VEHICLE_TYPES,
  toInsertRow,
  type Category,
  type Fuel,
  type VehicleWizardData,
} from "./types";
import { validateAll, validateStep, type StepErrors } from "./validation";

const STEPS = [
  "Basic Info",
  "Engine",
  "Transmission",
  "Dimensions",
  "Tires",
  "Braking",
  "Aerodynamics",
  "Performance",
] as const;

export function VehicleWizard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<VehicleWizardData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const current = useMemo(() => validateStep(step, f), [step, f]);
  const overall = useMemo(() => validateAll(f), [f]);

  function update<K extends keyof VehicleWizardData>(key: K, value: VehicleWizardData[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function next() {
    const res = validateStep(step, f);
    if (!res.ok) {
      setShowErrors(true);
      toast.error("Fix highlighted fields to continue.");
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setShowErrors(false);
    setStep((s) => Math.max(0, s - 1));
  }

  async function save() {
    const res = validateAll(f);
    if (!res.ok) {
      setShowErrors(true);
      const firstErrKey = Object.keys(res.errors)[0];
      toast.error(res.errors[firstErrKey] ?? "Fix validation errors before saving.");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You must be signed in.");
      const row = toInsertRow(f, u.user.id);
      const { data, error } = await supabase.from("vehicles").insert(row).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle created");
      nav({ to: "/vehicles/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  }

  const errs = showErrors ? current.errors : {};

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

      <div className="panel p-4 sm:p-6 space-y-6">
        {step === 0 && <StepBasics f={f} update={update} errs={errs} />}
        {step === 1 && <StepEngine f={f} update={update} errs={errs} />}
        {step === 2 && <StepTransmission f={f} update={update} errs={errs} />}
        {step === 3 && <StepDimensions f={f} update={update} errs={errs} />}
        {step === 4 && <StepTires f={f} update={update} errs={errs} />}
        {step === 5 && <StepBraking f={f} update={update} errs={errs} />}
        {step === 6 && <StepAero f={f} update={update} errs={errs} />}
        {step === 7 && <StepPerformance f={f} update={update} errs={errs} />}

        {showErrors && Object.keys(current.errors).length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <ul className="list-disc pl-4">
              {Object.entries(current.errors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        {step === STEPS.length - 1 && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              {overall.ok ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-primary" /> Ready to save — all engineering
                  checks passed.
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-destructive" /> Engineering checks failed.
                  Review previous steps.
                </>
              )}
            </div>
            {overall.warnings.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                {overall.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <Button type="button" variant="outline" disabled={step === 0} onClick={back}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" disabled={saving || !overall.ok} onClick={save}>
              <Check className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save vehicle"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Reusable field helpers --------------------------- */

type UpdateFn = <K extends keyof VehicleWizardData>(k: K, v: VehicleWizardData[K]) => void;
interface StepProps {
  f: VehicleWizardData;
  update: UpdateFn;
  errs: StepErrors;
}

function Field({
  label,
  error,
  children,
  required,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? String(value) : ""}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
    />
  );
}

function EnumSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border border-border/60 rounded-md px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* --------------------------- Steps --------------------------- */

function StepBasics({ f, update, errs }: StepProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Vehicle name" required error={errs.name}>
        <Input
          value={f.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Model S Plaid"
        />
      </Field>
      <Field label="Manufacturer" required error={errs.manufacturer}>
        <Input
          value={f.manufacturer}
          onChange={(e) => update("manufacturer", e.target.value)}
          placeholder="Tesla"
        />
      </Field>
      <Field label="Vehicle category" required>
        <EnumSelect
          value={f.category}
          onChange={(v) => update("category", v as Category)}
          options={CATEGORIES}
        />
      </Field>
      <Field label="Vehicle type" required error={errs.vehicle_type}>
        <EnumSelect
          value={f.vehicle_type}
          onChange={(v) => update("vehicle_type", v)}
          options={VEHICLE_TYPES}
        />
      </Field>
      <Field label="Model year" required error={errs.model_year}>
        <NumInput
          value={f.model_year}
          onChange={(n) => update("model_year", n)}
          step={1}
          min={1900}
        />
      </Field>
    </div>
  );
}

function StepEngine({ f, update, errs }: StepProps) {
  const isElectric = f.fuel_type === "electric";
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Fuel type" required>
          <EnumSelect
            value={f.fuel_type}
            onChange={(v) => update("fuel_type", v as Fuel)}
            options={FUELS}
          />
        </Field>
        <Field label="Engine type" required error={errs.engine_type}>
          <EnumSelect
            value={f.engine_type}
            onChange={(v) => update("engine_type", v)}
            options={ENGINE_TYPES}
          />
        </Field>
        <Field
          label={isElectric ? "Displacement (n/a)" : "Displacement (cc)"}
          required={!isElectric}
          error={errs.displacement_cc}
        >
          <NumInput
            value={f.displacement_cc}
            onChange={(n) => update("displacement_cc", n)}
            step={10}
            min={0}
          />
        </Field>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Max power" required error={errs.power_value}>
          <NumInput value={f.power_value} onChange={(n) => update("power_value", n)} step={1} />
        </Field>
        <Field label="Power unit">
          <Select
            value={f.power_unit}
            onValueChange={(v) => update("power_unit", v as "kW" | "HP")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kW">kW</SelectItem>
              <SelectItem value="HP">HP</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Max torque (Nm)" required error={errs.max_torque_nm}>
          <NumInput value={f.max_torque_nm} onChange={(n) => update("max_torque_nm", n)} />
        </Field>
        <Field label="Max RPM" required error={errs.max_rpm}>
          <NumInput value={f.max_rpm} onChange={(n) => update("max_rpm", n)} step={100} />
        </Field>
        <Field label="Idle RPM" required error={errs.idle_rpm}>
          <NumInput value={f.idle_rpm} onChange={(n) => update("idle_rpm", n)} step={50} />
        </Field>
        <Field label="Cylinders">
          <NumInput
            value={f.cylinders ?? 0}
            onChange={(n) => update("cylinders", n)}
            step={1}
            min={0}
          />
        </Field>
        <Field label="Compression ratio">
          <NumInput
            value={f.compression_ratio ?? 0}
            onChange={(n) => update("compression_ratio", n)}
            step={0.1}
          />
        </Field>
        <ToggleRow
          label="Turbocharged"
          checked={!!f.turbocharged}
          onChange={(v) => update("turbocharged", v)}
        />
      </div>
    </div>
  );
}

function StepTransmission({ f, update, errs }: StepProps) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Field label="Transmission type" required error={errs.transmission_type}>
        <EnumSelect
          value={f.transmission_type}
          onChange={(v) => update("transmission_type", v)}
          options={TRANSMISSION_TYPES}
        />
      </Field>
      <Field label="Drive layout" required error={errs.drive_layout}>
        <EnumSelect
          value={f.drive_layout}
          onChange={(v) => update("drive_layout", v)}
          options={DRIVE_LAYOUTS}
        />
      </Field>
      <Field label="Number of gears" required error={errs.num_gears}>
        <NumInput value={f.num_gears} onChange={(n) => update("num_gears", n)} step={1} min={1} />
      </Field>
      <Field label="Final drive ratio">
        <NumInput
          value={f.final_drive_ratio ?? 0}
          onChange={(n) => update("final_drive_ratio", n)}
          step={0.01}
        />
      </Field>
      <Field label="Differential type">
        <EnumSelect
          value={f.differential_type ?? "open"}
          onChange={(v) => update("differential_type", v)}
          options={DIFFERENTIALS}
        />
      </Field>
    </div>
  );
}

function StepDimensions({ f, update, errs }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Kerb weight (kg)" required error={errs.mass_kg}>
          <NumInput value={f.mass_kg} onChange={(n) => update("mass_kg", n)} step={10} />
        </Field>
        <Field label="Gross vehicle weight (kg)" required error={errs.gvw_kg}>
          <NumInput value={f.gvw_kg} onChange={(n) => update("gvw_kg", n)} step={10} />
        </Field>
        <Field label="Wheelbase (mm)" required error={errs.wheelbase_mm}>
          <NumInput value={f.wheelbase_mm} onChange={(n) => update("wheelbase_mm", n)} step={10} />
        </Field>
        <Field label="CoG height (mm)" required error={errs.cog_height_mm}>
          <NumInput value={f.cog_height_mm} onChange={(n) => update("cog_height_mm", n)} step={5} />
        </Field>
        <Field label="Front track width (mm)" required error={errs.front_track_mm}>
          <NumInput
            value={f.front_track_mm}
            onChange={(n) => update("front_track_mm", n)}
            step={5}
          />
        </Field>
        <Field label="Rear track width (mm)" required error={errs.rear_track_mm}>
          <NumInput value={f.rear_track_mm} onChange={(n) => update("rear_track_mm", n)} step={5} />
        </Field>
        <Field label="Ground clearance (mm)" required error={errs.ground_clearance_mm}>
          <NumInput
            value={f.ground_clearance_mm}
            onChange={(n) => update("ground_clearance_mm", n)}
            step={5}
          />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Length (mm)">
          <NumInput value={f.length_mm ?? 0} onChange={(n) => update("length_mm", n)} step={10} />
        </Field>
        <Field label="Width (mm)">
          <NumInput value={f.width_mm ?? 0} onChange={(n) => update("width_mm", n)} step={10} />
        </Field>
        <Field label="Height (mm)">
          <NumInput value={f.height_mm ?? 0} onChange={(n) => update("height_mm", n)} step={10} />
        </Field>
      </div>
    </div>
  );
}

function StepTires({ f, update, errs }: StepProps) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Field label="Tire radius (m)" required error={errs.tire_radius_m}>
        <NumInput
          value={f.tire_radius_m}
          onChange={(n) => update("tire_radius_m", n)}
          step={0.005}
        />
      </Field>
      <Field label="Friction coefficient μ" required error={errs.tire_friction_mu}>
        <NumInput
          value={f.tire_friction_mu}
          onChange={(n) => update("tire_friction_mu", n)}
          step={0.01}
        />
      </Field>
      <Field label="Tire type" required error={errs.tire_type}>
        <EnumSelect
          value={f.tire_type}
          onChange={(v) => update("tire_type", v)}
          options={TIRE_TYPES}
        />
      </Field>
      <Field label="Tire width (mm)">
        <NumInput
          value={f.tire_width_mm ?? 0}
          onChange={(n) => update("tire_width_mm", n)}
          step={5}
        />
      </Field>
      <Field label="Tire pressure (kPa)">
        <NumInput
          value={f.tire_pressure_kpa ?? 0}
          onChange={(n) => update("tire_pressure_kpa", n)}
          step={5}
        />
      </Field>
    </div>
  );
}

function StepBraking({ f, update, errs }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Front brake type" required error={errs.front_brake_type}>
          <EnumSelect
            value={f.front_brake_type}
            onChange={(v) => update("front_brake_type", v)}
            options={BRAKE_TYPES}
          />
        </Field>
        <Field label="Rear brake type" required error={errs.rear_brake_type}>
          <EnumSelect
            value={f.rear_brake_type}
            onChange={(v) => update("rear_brake_type", v)}
            options={BRAKE_TYPES}
          />
        </Field>
        <Field label="Brake efficiency (0–1)" required error={errs.brake_efficiency}>
          <NumInput
            value={f.brake_efficiency}
            onChange={(n) => update("brake_efficiency", n)}
            step={0.01}
            min={0}
            max={1}
          />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <ToggleRow label="ABS" checked={!!f.has_abs} onChange={(v) => update("has_abs", v)} />
        <ToggleRow label="ESC" checked={!!f.has_esc} onChange={(v) => update("has_esc", v)} />
        <ToggleRow label="EBD" checked={!!f.has_ebd} onChange={(v) => update("has_ebd", v)} />
      </div>
    </div>
  );
}

function StepAero({ f, update, errs }: StepProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Drag coefficient (Cd)" required error={errs.drag_coeff}>
        <NumInput value={f.drag_coeff} onChange={(n) => update("drag_coeff", n)} step={0.005} />
      </Field>
      <Field label="Frontal area (m²)" required error={errs.frontal_area_m2}>
        <NumInput
          value={f.frontal_area_m2}
          onChange={(n) => update("frontal_area_m2", n)}
          step={0.05}
        />
      </Field>
      <Field label="Lift coefficient (Cl)">
        <NumInput value={f.lift_coeff ?? 0} onChange={(n) => update("lift_coeff", n)} step={0.01} />
      </Field>
      <ToggleRow
        label="Rear spoiler"
        checked={!!f.rear_spoiler}
        onChange={(v) => update("rear_spoiler", v)}
      />
    </div>
  );
}

function StepPerformance({ f, update, errs }: StepProps) {
  const unit = f.fuel_type === "electric" ? "kWh/100km" : "km/L";
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Max speed (km/h)" required error={errs.top_speed_kmh}>
        <NumInput value={f.top_speed_kmh} onChange={(n) => update("top_speed_kmh", n)} step={1} />
      </Field>
      <Field
        label={f.fuel_type === "electric" ? "Battery capacity (kWh)" : "Fuel tank capacity (L)"}
        required
        error={errs.tank_capacity_l}
      >
        <NumInput
          value={f.tank_capacity_l}
          onChange={(n) => update("tank_capacity_l", n)}
          step={1}
        />
      </Field>
      <Field label={`Fuel efficiency (${unit})`} required error={errs.fuel_efficiency}>
        <NumInput
          value={f.fuel_efficiency}
          onChange={(n) => update("fuel_efficiency", n)}
          step={0.1}
        />
      </Field>
      <Field label="0–100 km/h time (s)">
        <NumInput
          value={f.zero_to_100_s ?? 0}
          onChange={(n) => update("zero_to_100_s", n)}
          step={0.1}
        />
      </Field>
    </div>
  );
}
