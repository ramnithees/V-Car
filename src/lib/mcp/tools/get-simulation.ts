import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_simulation",
  title: "Get simulation report",
  description:
    "Fetch one simulation run: vehicle and road specs, physics summary, safety prediction, and the AI engineering report.",
  inputSchema: { simulation_id: z.string().uuid().describe("ID of the simulation run.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ simulation_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("simulations")
      .select(
        "id,name,status,params,results,ai_summary,created_at," +
          "vehicle:vehicles(name,manufacturer,category,mass_kg,max_power_kw,drag_coeff,tire_friction_mu,track_m,cog_height_m)," +
          "road:roads(name,road_type,length_m,surface_mu,base_slope_deg,lane_count)",
      )
      .eq("id", simulation_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Simulation not found." }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { simulation: data },
    };
  },
});
