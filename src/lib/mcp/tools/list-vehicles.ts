import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_vehicles",
  title: "List vehicles",
  description:
    "List the signed-in user's vehicles in the VirtuDrive AI vehicle library, with key dynamics specs.",
  inputSchema: {
    search: z.string().trim().max(100).optional().describe("Optional name or manufacturer filter."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum vehicles to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("vehicles")
      .select(
        "id,name,manufacturer,category,mass_kg,max_power_kw,drag_coeff,tire_friction_mu,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) query = query.or(`name.ilike.%${search}%,manufacturer.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { vehicles: data ?? [] },
    };
  },
});
