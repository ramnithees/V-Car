import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/roads/")({
  head: () => ({
    meta: [
      { title: "Road Library — VirtuDrive AI" },
      {
        name: "description",
        content:
          "Design and manage test roads: curves, gradients, banking and surface friction for vehicle simulation.",
      },
      { property: "og:title", content: "Road Library — VirtuDrive AI" },
      {
        property: "og:description",
        content:
          "Design and manage test roads: curves, gradients, banking and surface friction for vehicle simulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Road Library",
          about:
            "Test road geometries — curves, gradients, banking and surface friction — used in VirtuDrive AI simulations.",
        }),
      },
    ],
  }),
  component: RoadsList,
});

function RoadsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["roads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roads")
        .select("*")
        .order("is_public", { ascending: true })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Roads"
        subtitle="Build custom routes or use seeded test tracks."
        action={
          <Link
            to="/roads/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 min-h-11"
          >
            <Plus className="w-4 h-4" /> New road
          </Link>
        }
      />
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading roads…</div>
      ) : !data?.length ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          No roads yet.{" "}
          <Link to="/roads/new" className="text-primary hover:underline">
            Build your first road
          </Link>{" "}
          to start testing.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {data?.map((r) => {
            const curves = (r.curves as Array<{ radius: number }>) ?? [];
            const minR = curves.length ? Math.min(...curves.map((c) => c.radius)) : null;
            return (
              <Link
                to="/roads/$id"
                params={{ id: r.id }}
                key={r.id}
                className="panel p-5 hover:border-primary/60 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      {r.road_type}
                    </div>
                    <div className="font-semibold mt-1">{r.name}</div>
                  </div>
                  {r.is_public && (
                    <span className="text-[10px] uppercase tracking-widest text-primary inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> seeded
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs num mt-3">
                  <Stat k="Length" v={`${(Number(r.length_m) / 1000).toFixed(2)} km`} />
                  <Stat k="μ" v={String(r.surface_mu)} />
                  <Stat k="Slope" v={`${r.base_slope_deg}°`} />
                  <Stat k="Curves" v={String(curves.length)} />
                  {minR !== null && <Stat k="Min R" v={`${minR} m`} />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-widest">{k}</div>
      <div>{v}</div>
    </div>
  );
}
