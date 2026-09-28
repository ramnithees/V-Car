import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_roads",
  title: "List roads",
  description:
    "List the signed-in user's road profiles with geometry summary (length, surface friction, slope, curve count).",
  inputSchema: {
    search: z.string().trim().max(100).optional().describe("Optional road name filter."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum roads to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("roads")
      .select("id,name,road_type,length_m,surface_mu,base_slope_deg,curves,lane_count,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const roads = (data ?? []).map((r) => ({
      ...r,
      curves: undefined,
      curve_count: Array.isArray(r.curves) ? r.curves.length : 0,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(roads, null, 2) }],
      structuredContent: { roads },
    };
  },
});
