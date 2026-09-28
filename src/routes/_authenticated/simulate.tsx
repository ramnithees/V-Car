import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { runSimulation, type RoadSpec } from "@/lib/physics/simulation";
import type { VehicleSpec } from "@/lib/physics";
import { predictFromResults } from "@/lib/ai/heuristics";
import { z } from "zod";
import { Loader2, PlayCircle } from "lucide-react";

const searchSchema = z.object({
  vehicleId: z.string().optional(),
  roadId: z.string().optional(),
});

const TARGET_MIN_KMH = 20;
const TARGET_MAX_KMH = 400;

export const Route = createFileRoute("/_authenticated/simulate")({
  head: () => ({
    meta: [
      { title: "Run a Simulation — VirtuDrive AI" },
      {
        name: "description",
        content:
          "Pair a vehicle with a road and run a deterministic physics simulation with AI-explained results.",
      },
      { property: "og:title", content: "Run a Simulation — VirtuDrive AI" },
      {
        property: "og:description",
        content:
          "Pair a vehicle with a road and run a deterministic physics simulation with AI-explained results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: Simulate,
});

function Simulate() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [vehicleId, setVehicleId] = useState<string | undefined>(search.vehicleId);
  const [roadId, setRoadId] = useState<string | undefined>(search.roadId);
  const [name, setName] = useState("");
  const [targetKmh, setTargetKmh] = useState<number>(140);
  const [running, setRunning] = useState(false);

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,name,manufacturer,category")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: roads } = useQuery({
    queryKey: ["roads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roads")
        .select("id,name,road_type,length_m")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const defaultName = useMemo(() => {
    const v = vehicles?.find((x) => x.id === vehicleId);
    const r = roads?.find((x) => x.id === roadId);
    if (v && r) return `${v.name} on ${r.name}`;
    return "";
  }, [vehicles, roads, vehicleId, roadId]);

  async function run() {
    if (!vehicleId || !roadId) {
      toast.error("Pick a vehicle and a road");
      return;
    }
    // HTML min/max is advisory only — the number input still accepts typed/pasted values.
    if (!Number.isFinite(targetKmh) || targetKmh < TARGET_MIN_KMH || targetKmh > TARGET_MAX_KMH) {
      toast.error(
        `Driver target speed must be between ${TARGET_MIN_KMH} and ${TARGET_MAX_KMH} km/h`,
      );
      return;
    }
    setRunning(true);
    try {
      const [{ data: veh, error: vErr }, { data: road, error: rErr }, { data: u }] =
        await Promise.all([
          supabase.from("vehicles").select("*").eq("id", vehicleId).single(),
          supabase.from("roads").select("*").eq("id", roadId).single(),
          supabase.auth.getUser(),
        ]);
      if (vErr) throw vErr;
      if (rErr) throw rErr;
      if (!u.user) throw new Error("Not signed in");

      const spec: VehicleSpec = {
        mass_kg: +veh.mass_kg,
        wheelbase_m: +veh.wheelbase_m,
        track_m: +veh.track_m,
        cog_height_m: +veh.cog_height_m,
        frontal_area_m2: +veh.frontal_area_m2,
        drag_coeff: +veh.drag_coeff,
        rolling_resist_coeff: +veh.rolling_resist_coeff,
        tire_friction_mu: +veh.tire_friction_mu,
        max_power_kw: +veh.max_power_kw,
        max_torque_nm: +veh.max_torque_nm,
        engine_efficiency: +veh.engine_efficiency,
        fuel_energy_mj_per_l: +veh.fuel_energy_mj_per_l,
        fuel_type: veh.fuel_type,
      };
      const roadSpec: RoadSpec = {
        length_m: +road.length_m,
        surface_mu: +road.surface_mu,
        base_slope_deg: +road.base_slope_deg,
        curves: (road.curves as unknown as RoadSpec["curves"]) ?? [],
        slopes: (road.slopes as unknown as RoadSpec["slopes"]) ?? [],
      };

      const results = runSimulation(spec, roadSpec, { driver_target_kmh: targetKmh, step_m: 5 });
      const prediction = predictFromResults(spec, results);

      // Two-phase write: the run is only marked completed once telemetry landed,
      // so a partial write can never masquerade as a finished simulation.
      const { data: sim, error: sErr } = await supabase
        .from("simulations")
        .insert({
          owner_id: u.user.id,
          vehicle_id: vehicleId,
          road_id: roadId,
          name: name || defaultName || "Untitled simulation",
          status: "running",
          params: { driver_target_kmh: targetKmh } as never,
          results: { summary: results.summary, prediction } as never,
        })
        .select("id")
        .single();
      if (sErr) throw sErr;

      // Insert samples in batches (downsample if huge)
      const stride = Math.max(1, Math.ceil(results.samples.length / 400));
      const rows = results.samples
        .filter((_, i) => i % stride === 0)
        .map((s) => ({
          simulation_id: sim.id,
          owner_id: u.user.id,
          idx: s.idx,
          s_m: s.s_m,
          t_s: s.t_s,
          x: s.x,
          y: s.y,
          z: s.z,
          heading_rad: s.heading_rad,
          speed_mps: s.speed_mps,
          lat_accel: s.lat_accel,
          long_accel: s.long_accel,
          steering_deg: s.steering_deg,
          fuel_rate_lps: s.fuel_rate_lps,
          safety_score: s.safety_score,
        }));
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { error } = await supabase.from("simulation_samples").insert(chunk);
          if (error) throw error;
        }
        const { error: doneErr } = await supabase
          .from("simulations")
          .update({ status: "completed" })
          .eq("id", sim.id);
        if (doneErr) throw doneErr;
      } catch (persistErr) {
        // Roll back the half-written run so the library never shows a broken record.
        await supabase.from("simulations").delete().eq("id", sim.id);
        throw persistErr;
      }

      qc.invalidateQueries({ queryKey: ["sims"] });
      qc.invalidateQueries({ queryKey: ["counts"] });
      toast.success("Simulation complete");
      nav({ to: "/simulations/$id", params: { id: sim.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Run simulation"
        subtitle="Real physics, deterministic results, AI-explained findings."
      />
      <div className="panel p-4 sm:p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose vehicle…" />
              </SelectTrigger>
              <SelectContent>
                {vehicles?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.manufacturer ? `${v.manufacturer} ` : ""}
                    {v.name} · {v.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Road</Label>
            <Select value={roadId} onValueChange={setRoadId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose road…" />
              </SelectTrigger>
              <SelectContent>
                {roads?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {r.road_type} · {(Number(r.length_m) / 1000).toFixed(1)} km
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Driver target speed (km/h)</Label>
            <Input
              type="number"
              min={TARGET_MIN_KMH}
              max={TARGET_MAX_KMH}
              value={targetKmh}
              onChange={(e) => setTargetKmh(Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Capped by physics: cornering, rollover, brake, and drive limits.
            </p>
          </div>
          <div>
            <Label>Simulation name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName || "e.g. Corolla on NH5"}
            />
          </div>
        </div>

        <Button
          onClick={run}
          disabled={running || !vehicleId || !roadId}
          size="lg"
          className="w-full"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running physics…
            </>
          ) : (
            <>
              <PlayCircle className="w-5 h-5 mr-2" /> Run simulation
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
