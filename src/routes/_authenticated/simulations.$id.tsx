import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Suspense, lazy, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { QueryStateView } from "@/components/QueryStateView";
import { explainSimulation, type AIExplanation } from "@/lib/ai/explain.functions";
import { useServerFn } from "@tanstack/react-start";
import { predictFromResults } from "@/lib/ai/heuristics";
import type { SimResults, SimSample, CurveType } from "@/lib/physics/simulation";
import { computeSafeProfile, buildSafeSegmentTable } from "@/lib/physics/simulation";
import type { VehicleSpec } from "@/lib/physics";
import { LiveMinimap } from "@/components/sim/LiveMinimap";
import { LiveTelemetry } from "@/components/sim/LiveTelemetry";
import { SafeSpeedHud } from "@/components/sim/SafeSpeedHud";
import { CameraControls } from "@/components/sim/CameraControls";
import type { PathSample } from "@/components/sim/store";
import { lazyRetry } from "@/lib/lazy-retry";


const Scene3D = lazy(
  lazyRetry(() => import("@/components/Sim3DScene").then((m) => ({ default: m.Sim3DScene }))),
);


export const Route = createFileRoute("/_authenticated/simulations/$id")({
  // Loader runs behind the _authenticated gate; it only feeds page metadata.
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("simulations")
      .select("name,vehicle:vehicles(name),road:roads(name)")
      .eq("id", params.id)
      .maybeSingle();
    return { sim: data };
  },
  head: ({ loaderData }) => {
    const s = loaderData?.sim as
      | { name?: string; vehicle?: { name?: string } | null; road?: { name?: string } | null }
      | null
      | undefined;
    const title = `${s?.name ?? "Simulation"} Results — VirtuDrive AI`.slice(0, 60);
    const description = s
      ? `Simulation results for ${s.vehicle?.name ?? "the vehicle"} on ${s.road?.name ?? "the road"}: speed, g-forces, safety score, fuel use and the AI engineering report.`
      : "Simulation results with speed, g-forces, safety score, fuel use and an AI engineering report.";
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 160) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 160) },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SimResultsPage,
});

interface SimRow {
  id: string;
  name: string;
  created_at: string;
  vehicle: {
    id: string;
    name: string;
    manufacturer: string | null;
    category: string;
    mass_kg: number;
    wheelbase_m: number;
    track_m: number;
    cog_height_m: number;
    tire_friction_mu: number;
    fuel_type: string;
  } | null;
  road: {
    id: string;
    name: string;
    road_type: string;
    length_m: number;
    surface_mu: number;
    base_slope_deg: number;
    curves: unknown;
    slopes: unknown;
  } | null;
  results: {
    summary: SimResults["summary"];
    prediction: ReturnType<typeof predictFromResults>;
  } | null;
  ai_summary: AIExplanation | null;
}

function SimResultsPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const explain = useServerFn(explainSimulation);
  const [generatingAI, setGeneratingAI] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sim", id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulations")
        .select("*, vehicle:vehicles(*), road:roads(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SimRow) ?? null;
    },
  });

  const { data: samples } = useQuery({
    queryKey: ["sim-samples", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_samples")
        .select("*")
        .eq("simulation_id", id)
        .order("idx");
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("simulations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Simulation deleted");
      qc.invalidateQueries({ queryKey: ["sims"] });
      navigate({ to: "/simulations", replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  async function generateAI() {
    if (!data?.results || !data.vehicle || !data.road) return;
    setGeneratingAI(true);
    try {
      // The server function reads the simulation itself (RLS-scoped) so the
      // model never sees client-supplied physics numbers.
      const explanation = await explain({ data: { simulationId: id } });
      const { error } = await supabase
        .from("simulations")
        .update({ ai_summary: explanation as never })
        .eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sim", id] });
      toast.success("AI report generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI failed";
      if (msg.includes("429")) toast.error("AI rate limit — please try again in a moment");
      else if (msg.includes("402")) toast.error("AI credits exhausted");
      else toast.error(msg);
    } finally {
      setGeneratingAI(false);
    }
  }

  async function downloadPDF() {
    if (!data?.results || !data.vehicle || !data.road) return;
    try {
      const [{ generatePdfReport }, snap] = await Promise.all([
        import("@/lib/pdf/report"),
        import("@/lib/pdf/snapshots"),
      ]);
      const scene = snap.captureSceneSnapshot();
      const path = snap.renderPathSnapshot(pathSamples);
      const elevation = snap.renderElevationSnapshot(pathSamples);
      const blob = await generatePdfReport({
        simName: data.name,
        simId: data.id,
        createdAt: data.created_at,
        vehicle: data.vehicle,
        road: data.road,
        summary: data.results.summary,
        prediction: data.results.prediction,
        ai: data.ai_summary,
        samples: pathSamples as unknown as SimSample[],
        segments: buildSafeSegmentTable(
          data.vehicle as unknown as VehicleSpec,
          {
            length_m: Number(data.road.length_m),
            surface_mu: Number(data.road.surface_mu),
            base_slope_deg: Number(data.road.base_slope_deg),
            curves: (data.road.curves as never) ?? [],
            slopes: (data.road.slopes as never) ?? [],
          },
          pathSamples as unknown as SimSample[],
          (data.results.summary as { target_kmh?: number }).target_kmh ??
            (data as unknown as { params?: { driver_target_kmh?: number } }).params
              ?.driver_target_kmh,
        ),
        snapshots: { scene, path, elevation },
      });
      if (!blob || blob.size === 0) throw new Error("PDF generation produced an empty file");
      // Force MIME so browsers treat the object URL as a downloadable PDF.
      const pdfBlob =
        blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.replace(/[/\\?%*:|"<>]/g, "_")}.pdf`;
      a.rel = "noopener";
      // Anchor must be in the DOM for Firefox; revoke only after the download stream starts.
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 4000);
      toast.success("Report downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    }
  }

  const pathSamples: PathSample[] = useMemo(() => {
    const rows = samples ?? [];
    if (!rows.length || !data?.road || !data?.vehicle) return [];
    // Reconstruct road spec for adaptive safe-speed profile.
    const road = {
      length_m: Number(data.road.length_m),
      surface_mu: Number(data.road.surface_mu),
      base_slope_deg: Number(data.road.base_slope_deg),
      curves:
        (data.road.curves as Array<{
          station: number;
          radius: number;
          angle_deg: number;
          length_m?: number;
          bank_deg?: number;
          type?: CurveType;
        }>) ?? [],
      slopes:
        (data.road.slopes as Array<{
          direction: "uphill" | "downhill";
          angle_deg: number;
          length_m: number;
          transition_m: number;
          bank_deg: number;
          bank_dir: "left" | "right" | "flat";
        }>) ?? [],
    };
    const vehicle = data.vehicle as unknown as VehicleSpec;
    const targetKmh =
      (data.results?.summary as { target_kmh?: number } | undefined)?.target_kmh ??
      (data as unknown as { params?: { driver_target_kmh?: number } }).params?.driver_target_kmh;
    const stepM = rows.length > 1 ? Number(rows[1].s_m) - Number(rows[0].s_m) : 5;
    const profile = computeSafeProfile(vehicle, road, targetKmh, stepM);
    const lookup = (s_m: number) => {
      const i = Math.min(profile.length - 1, Math.max(0, Math.round(s_m / stepM)));
      return profile[i];
    };
    return rows.map((r) => {
      const s_m = Number(r.s_m);
      const p = lookup(s_m);
      return {
        idx: Number(r.idx),
        s_m,
        t_s: Number(r.t_s),
        x: Number(r.x),
        y: Number(r.y),
        z: Number(r.z),
        heading_rad: Number(r.heading_rad),
        speed_mps: Number(r.speed_mps),
        lat_accel: Number(r.lat_accel),
        long_accel: Number(r.long_accel),
        steering_deg: Number(r.steering_deg),
        fuel_rate_lps: Number(r.fuel_rate_lps),
        safety_score: Number(r.safety_score),
        radius_m: p.radius_m,
        bank_rad: p.bank_rad,
        slope_rad: p.slope_rad,
        safe_speed_mps: p.safe_mps,
        limiting_factor: p.limiting,
      };
    });
  }, [samples, data]);

  if (isLoading || error || !data) {
    return (
      <QueryStateView
        isLoading={isLoading}
        error={error}
        notFound={!isLoading && !error && !data}
        entity="simulation"
        backTo="/simulations"
        backLabel="Back to simulations"
        onRetry={() => void refetch()}
      />
    );
  }
  if (!data.results) {
    return (
      <div className="p-4 sm:p-8 max-w-lg mx-auto">
        <div className="panel p-6 text-center">
          <h2 className="font-semibold">This run has no results</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The simulation finished without producing telemetry.
          </p>
          <Link to="/simulate" className="inline-block mt-6 text-sm text-primary hover:underline">
            Run a new simulation
          </Link>
        </div>
      </div>
    );
  }

  const s = data.results.summary;
  const p = data.results.prediction;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={data.name}
        subtitle={`${data.vehicle?.name} • ${data.road?.name} • ${new Date(data.created_at).toLocaleString()}`}
        action={
          <>
            <Button variant="outline" onClick={downloadPDF}>
              <Download className="w-4 h-4 mr-2" /> PDF Report
            </Button>
            <ConfirmDeleteButton
              ariaLabel="Delete simulation"
              pending={del.isPending}
              title="Delete this simulation?"
              description={
                <>
                  <p>
                    <strong>{data.name}</strong> and all of its telemetry samples will be
                    permanently removed.
                  </p>
                  <p>
                    The vehicle and road used by this run are not affected. This cannot be undone.
                  </p>
                </>
              }
              onConfirm={() => del.mutate()}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <KPI k="Top speed" v={`${s.top_speed_kmh.toFixed(0)} km/h`} tone="primary" />
        <KPI k="Avg speed" v={`${s.avg_speed_kmh.toFixed(0)} km/h`} />
        <KPI
          k="Peak lateral"
          v={`${s.max_lat_g.toFixed(2)} g`}
          tone={s.max_lat_g > 0.8 ? "warn" : undefined}
        />
        <KPI
          k="Safety score"
          v={`${p.safety_score}/100`}
          tone={
            p.risk_level === "critical" || p.risk_level === "high"
              ? "danger"
              : p.risk_level === "moderate"
                ? "warn"
                : "success"
          }
        />
        <KPI k="Fuel / 100km" v={`${s.fuel_per_100km.toFixed(2)} L*`} />
        <KPI k="Duration" v={`${s.total_time_s.toFixed(1)} s`} />
        <KPI k="Skid P" v={`${(p.skid_probability * 100).toFixed(0)}%`} />
        <KPI k="Rollover P" v={`${(p.rollover_probability * 100).toFixed(0)}%`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="panel p-3 sm:p-4 lg:col-span-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            3D playback
          </div>
          <div className="h-[60vh] min-h-[320px] sm:h-[480px] lg:h-[560px] rounded-md overflow-hidden border border-border/60">
            <Suspense
              fallback={
                <div className="grid place-items-center h-full text-muted-foreground text-sm">
                  Loading 3D…
                </div>
              }
            >
              {pathSamples.length > 0 && <Scene3D samples={pathSamples} />}
            </Suspense>
          </div>
        </div>
        <div className="panel p-3 sm:p-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Live minimap
            </div>
            {pathSamples.length > 0 && <LiveMinimap samples={pathSamples} />}
          </div>
          <CameraControls inline />
        </div>
      </div>

      <div className="mt-6">
        {pathSamples.length > 0 && (
          <SafeSpeedHud
            samples={pathSamples}
            targetKmh={
              (data as unknown as { params?: { driver_target_kmh?: number } }).params
                ?.driver_target_kmh ?? null
            }
          />
        )}
      </div>

      <div className="mt-6 panel p-3 sm:p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
          Live telemetry
        </div>
        {pathSamples.length > 0 && (
          <LiveTelemetry
            samples={pathSamples}
            targetKmh={
              (data as unknown as { params?: { driver_target_kmh?: number } }).params
                ?.driver_target_kmh ?? null
            }
            vehicleMu={Number(data.vehicle?.tire_friction_mu ?? 1)}
            roadMu={Number(data.road?.surface_mu ?? 1)}
            ssf={
              data.vehicle
                ? Number(data.vehicle.track_m) / (2 * Number(data.vehicle.cog_height_m))
                : 1.4
            }
          />
        )}
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
            Key risks
          </h3>
          {p.key_risks.length ? (
            <ul className="text-sm space-y-2 list-disc list-inside">
              {p.key_risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No significant risks detected.</div>
          )}
        </div>
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
            Baseline recommendations
          </h3>
          <ul className="text-sm space-y-2 list-disc list-inside">
            {p.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 panel p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground">
              AI Engineering Report
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              GPT-powered analysis grounded in physics results.
            </p>
          </div>
          <Button
            onClick={generateAI}
            disabled={generatingAI}
            variant={data.ai_summary ? "outline" : "default"}
            className="w-full sm:w-auto"
          >
            {generatingAI ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…
              </>
            ) : data.ai_summary ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Generate
              </>
            )}
          </Button>
        </div>
        {data.ai_summary ? (
          <div className="space-y-4 text-sm">
            <AiSection label="Executive summary" body={data.ai_summary.executive_summary} />
            <AiSection label="Performance analysis" body={data.ai_summary.performance_analysis} />
            <AiSection label="Safety analysis" body={data.ai_summary.safety_analysis} />
            <AiSection label="Fuel / energy" body={data.ai_summary.fuel_analysis} />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Engineering recommendations
              </div>
              <ul className="list-disc list-inside space-y-1">
                {data.ai_summary.engineering_recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Click Generate to add narrative analysis.
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-6">
        * Fuel/100km uses the vehicle's fuel energy density; for EVs this is a kWh-equivalent based
        on the configured energy per litre.{" "}
        <Link to="/simulate" className="text-primary hover:underline">
          Run another simulation →
        </Link>
      </p>
    </div>
  );
}

function KPI({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "primary" | "warn" | "danger" | "success";
}) {
  const c =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : tone === "primary"
            ? "text-primary"
            : "";
  return (
    <div className="panel p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
        {k}
      </div>
      <div className={`text-lg sm:text-2xl font-semibold num mt-1 ${c}`}>{v}</div>
    </div>
  );
}
function AiSection({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <p className="leading-relaxed">{body}</p>
    </div>
  );
}
