import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_simulations",
  title: "List simulations",
  description:
    "List the signed-in user's simulation runs with status, vehicle, road, and headline results.",
  inputSchema: {
    status: z
      .enum(["queued", "running", "completed", "failed"])
      .optional()
      .describe("Optional status filter."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum runs to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("simulations")
      .select("id,name,status,created_at,results,vehicle:vehicles(name),road:roads(name)")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const runs = (data ?? []).map((s) => {
      const results = s.results as { summary?: Record<string, number> } | null;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        created_at: s.created_at,
        vehicle: (s.vehicle as { name?: string } | null)?.name ?? null,
        road: (s.road as { name?: string } | null)?.name ?? null,
        summary: results?.summary ?? null,
      };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(runs, null, 2) }],
      structuredContent: { simulations: runs },
    };
  },
});
