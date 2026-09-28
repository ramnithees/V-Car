import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Car, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vehicles/")({
  head: () => ({
    meta: [
      { title: "Vehicle Library — VirtuDrive AI" },
      {
        name: "description",
        content:
          "Manage vehicle specifications — mass, aero, powertrain and tyre data used by the physics engine.",
      },
      { property: "og:title", content: "Vehicle Library — VirtuDrive AI" },
      {
        property: "og:description",
        content:
          "Manage vehicle specifications — mass, aero, powertrain and tyre data used by the physics engine.",
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
          name: "Vehicle Library",
          about: "Vehicle dynamics specifications used by the VirtuDrive AI physics engine.",
        }),
      },
    ],
  }),
  component: VehiclesList,
});

function VehiclesList() {
  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
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
        title="Vehicles"
        subtitle="Real production specs and your custom designs."
        action={
          <Link
            to="/vehicles/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 min-h-11"
          >
            <Plus className="w-4 h-4" /> New vehicle
          </Link>
        }
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading vehicles…</div>
      ) : !data?.length ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          No vehicles yet.{" "}
          <Link to="/vehicles/new" className="text-primary hover:underline">
            Add your first vehicle
          </Link>{" "}
          to start testing.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
          {data?.map((v) => (
            <Link
              to="/vehicles/$id"
              params={{ id: v.id }}
              key={v.id}
              className="panel p-5 hover:border-primary/60 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    {v.category}
                  </div>
                  <div className="font-semibold mt-1 group-hover:text-primary transition-colors">
                    {v.manufacturer ? `${v.manufacturer} ${v.name}` : v.name}
                  </div>
                </div>
                {v.is_public ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary">
                    <Sparkles className="w-3 h-3" /> seeded
                  </span>
                ) : (
                  <Car className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs num">
                <Stat k="Mass" v={`${v.mass_kg} kg`} />
                <Stat k="Power" v={`${v.max_power_kw} kW`} />
                <Stat k="μ" v={String(v.tire_friction_mu)} />
                <Stat k="Cd" v={String(v.drag_coeff)} />
                <Stat k="SSF" v={(Number(v.track_m) / (2 * Number(v.cog_height_m))).toFixed(2)} />
                <Stat k="Fuel" v={v.fuel_type} />
              </div>
            </Link>
          ))}
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
