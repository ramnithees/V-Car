import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PlayCircle, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { QueryStateView } from "@/components/QueryStateView";
import { RoadMap } from "@/components/RoadMap";
import { checkDeleteAllowed, describeDeleteError } from "@/lib/delete-guard";

export const Route = createFileRoute("/_authenticated/roads/$id")({
  // Loader runs behind the _authenticated gate; it only feeds page metadata.
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("roads")
      .select("name,road_type,length_m")
      .eq("id", params.id)
      .maybeSingle();
    return { road: data };
  },
  head: ({ loaderData }) => {
    const r = loaderData?.road;
    const title = `${r?.name ?? "Road"} Profile — VirtuDrive AI`.slice(0, 60);
    const description = r
      ? `Geometry and surface profile for ${r.name}: ${r.road_type} road, ${(Number(r.length_m) / 1000).toFixed(2)} km, with curves, gradients and friction used in simulation.`
      : "Road geometry and surface profile used by the VirtuDrive AI physics engine.";
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
  component: RoadDetail,
});

function RoadDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const {
    data: r,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["road", id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("roads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Simulations reference roads with ON DELETE RESTRICT — block the delete when any exist.
  const { data: dependentSims } = useQuery({
    queryKey: ["road-impact", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("simulations")
        .select("id", { count: "exact", head: true })
        .eq("road_id", id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("roads").delete().eq("id", id).select("id");
      if (error) throw new Error(describeDeleteError("road", error));
      if (!data || data.length === 0) throw new Error("Delete blocked (permission denied)");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roads"] });
      qc.invalidateQueries({ queryKey: ["sims"] });
      toast.success("Road deleted");
      nav({ to: "/roads", replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading || error || !r) {
    return (
      <QueryStateView
        isLoading={isLoading}
        error={error}
        notFound={!isLoading && !error && !r}
        entity="road"
        backTo="/roads"
        backLabel="Back to roads"
        onRetry={() => void refetch()}
      />
    );
  }
  const curves =
    (r.curves as Array<{
      station: number;
      radius: number;
      angle_deg: number;
      bank_deg?: number;
    }>) ?? [];
  const guard = checkDeleteAllowed("road", dependentSims);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title={r.name}
        subtitle={`${r.road_type} • ${(Number(r.length_m) / 1000).toFixed(2)} km • μ ${r.surface_mu}`}
        action={
          <>
            <Link to="/simulate" search={{ roadId: id }}>
              <Button>
                <PlayCircle className="w-4 h-4 mr-2" /> Simulate
              </Button>
            </Link>
            {!r.is_public &&
              (guard.allowed ? (
                <ConfirmDeleteButton
                  ariaLabel="Delete road"
                  pending={del.isPending}
                  title="Delete this road?"
                  description={
                    <>
                      <p>
                        <strong>{r.name}</strong> will be permanently removed.
                      </p>
                      <p>No simulations currently use this road.</p>
                      <p>This cannot be undone.</p>
                    </>
                  }
                  onConfirm={() => del.mutate()}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="destructive" disabled aria-label="Delete road (blocked)">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <p className="text-xs text-destructive max-w-[16rem]" role="status">
                    {guard.message}
                  </p>
                </div>
              ))}
          </>
        }
      />

      <div className="grid md:grid-cols-3 gap-4 md:gap-6">
        <div className="panel p-3 sm:p-4 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Layout</div>
          <RoadMap length_m={Number(r.length_m)} curves={curves} />
        </div>
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Curves ({curves.length})
          </h3>
          <div className="space-y-2 text-sm num">
            {curves.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-4 gap-2 py-2 border-b border-border/40 last:border-0"
              >
                <span className="text-muted-foreground">
                  #{i + 1} @ {c.station}m
                </span>
                <span>R {c.radius}m</span>
                <span>{c.angle_deg}°</span>
                <span className="text-right">Bank {c.bank_deg ?? 0}°</span>
              </div>
            ))}
            {curves.length === 0 && (
              <div className="text-muted-foreground text-sm">Straight road</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
