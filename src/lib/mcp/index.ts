import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listVehiclesTool from "./tools/list-vehicles";
import listRoadsTool from "./tools/list-roads";
import listSimulationsTool from "./tools/list-simulations";
import getSimulationTool from "./tools/get-simulation";

// The OAuth issuer must be the direct Supabase host; the project ref survives publish.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "virtudrive-ai-platform",
  title: "VirtuDrive AI Platform",
  version: "0.1.0",
  instructions:
    "Tools for VirtuDrive AI, a virtual vehicle performance testing and road simulation platform. " +
    "Use `list_vehicles` and `list_roads` to explore the signed-in engineer's library, `list_simulations` " +
    "to browse runs, and `get_simulation` for full physics results, safety prediction, and AI engineering report.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listVehiclesTool, listRoadsTool, listSimulationsTool, getSimulationTool],
});
