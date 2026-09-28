import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Car,
  Route as RouteIcon,
  PlayCircle,
  LineChart,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const DASH_DESC =
  "Your VirtuDrive AI test lab at a glance: recent simulation runs, vehicle and road counts, and quick access to new tests.";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Test Lab Dashboard — VirtuDrive AI" },
      { name: "description", content: DASH_DESC },
      { property: "og:title", content: "Test Lab Dashboard — VirtuDrive AI" },
      { property: "og:description", content: DASH_DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: sims } = useQuery({
    queryKey: ["sims", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulations")
        .select(
          "id,name,status,created_at,results,vehicle:vehicles(name),road:roads(name,road_type)",
        )
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["counts"],
    queryFn: async () => {
      const [v, r, s] = await Promise.all([
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("roads").select("id", { count: "exact", head: true }),
        supabase.from("simulations").select("id", { count: "exact", head: true }),
      ]);
      return { vehicles: v.count ?? 0, roads: r.count ?? 0, sims: s.count ?? 0 };
    },
  });

  const kpis = [
    { label: "Vehicles", value: counts?.vehicles ?? 0, icon: Car, to: "/vehicles" as const },
    { label: "Roads", value: counts?.roads ?? 0, icon: RouteIcon, to: "/roads" as const },
    {
      label: "Simulations",
      value: counts?.sims ?? 0,
      icon: LineChart,
      to: "/simulations" as const,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Dashboard"
        subtitle="Your virtual test lab at a glance."
        action={
          <Link
            to="/simulate"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 min-h-11"
          >
            <PlayCircle className="w-4 h-4" /> New simulation
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.to}
            className="panel p-4 sm:p-5 hover:border-primary/60 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {k.label}
              </span>
              <k.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-semibold num">{k.value}</div>
          </Link>
        ))}
      </div>

      <section className="panel p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
            Recent simulations
          </h2>
          <Link to="/simulations" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {!sims || sims.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border/60">
            {sims.map((s) => {
              const summary = (
                s.results as {
                  summary?: { top_speed_kmh?: number; min_safety_score?: number };
                } | null
              )?.summary;
              return (
                <Link
                  key={s.id}
                  to="/simulations/$id"
                  params={{ id: s.id }}
                  className="flex flex-col gap-1 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-center py-3 hover:bg-accent/5 rounded-md px-2"
                >
                  <div className="sm:col-span-4 truncate font-medium">{s.name}</div>
                  <div className="sm:col-span-3 text-xs text-muted-foreground truncate">
                    {s.vehicle?.name} • {s.road?.name}
                  </div>
                  <div className="flex items-center gap-3 sm:contents text-xs">
                    <div className="sm:col-span-2">
                      {s.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="w-3 h-3" /> completed
                        </span>
                      ) : s.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="w-3 h-3" /> failed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{s.status}</span>
                      )}
                    </div>
                    <div className="sm:col-span-2 sm:text-right num">
                      {summary?.top_speed_kmh?.toFixed(0) ?? "—"} km/h
                    </div>
                    <div className="sm:col-span-1 sm:text-right num ml-auto sm:ml-0">
                      {summary?.min_safety_score?.toFixed(0) ?? "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-sm text-muted-foreground">
      No simulations yet.{" "}
      <Link to="/simulate" className="text-primary hover:underline">
        Run your first one
      </Link>
      .
    </div>
  );
}
