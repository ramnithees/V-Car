import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlayCircle,
  Search,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/simulations/")({
  head: () => ({
    meta: [
      { title: "Simulation Runs — VirtuDrive AI" },
      {
        name: "description",
        content:
          "Browse, search and sort every virtual vehicle test run in your VirtuDrive AI test lab.",
      },
      { property: "og:title", content: "Simulation Runs — VirtuDrive AI" },
      {
        property: "og:description",
        content:
          "Browse, search and sort every virtual vehicle test run in your VirtuDrive AI test lab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulationsList,
});

const PAGE_SIZE = 20;
type SortKey = "created_desc" | "created_asc" | "name_asc";

function SimulationsList() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["sims", "list", search, sort, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("simulations")
        .select(
          "id,name,status,created_at,results,vehicle:vehicles(name),road:roads(name,road_type)",
          { count: "exact" },
        );
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      q =
        sort === "name_asc"
          ? q.order("name", { ascending: true })
          : q.order("created_at", { ascending: sort === "created_asc" });
      const { data, error, count } = await q.range(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Simulations"
        subtitle="Every run in your test lab, searchable and sortable."
        action={
          <Link
            to="/simulate"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 min-h-11"
          >
            <PlayCircle className="w-4 h-4" /> New simulation
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by run name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as SortKey);
            setPage(0);
          }}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Newest first</SelectItem>
            <SelectItem value="created_asc">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="panel p-4 sm:p-6">
        {error ? (
          <div className="text-center py-10 text-sm">
            <p className="text-destructive">
              {error instanceof Error ? error.message : "Could not load simulations."}
            </p>
            <Button className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading simulations…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {search ? (
              `No simulations match “${search}”.`
            ) : (
              <>
                No simulations yet.{" "}
                <Link to="/simulate" className="text-primary hover:underline">
                  Run your first one
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <div className={`divide-y divide-border/60 ${isFetching ? "opacity-60" : ""}`}>
            {data.rows.map((s) => {
              const summary = s.results as {
                summary?: { top_speed_kmh?: number };
                prediction?: { safety_score?: number };
              } | null;
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
                      {summary?.summary?.top_speed_kmh?.toFixed(0) ?? "—"} km/h
                    </div>
                    <div className="sm:col-span-1 sm:text-right num ml-auto sm:ml-0">
                      {summary?.prediction?.safety_score?.toFixed(0) ?? "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground num">
              {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
