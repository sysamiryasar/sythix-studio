import { agentRoute } from "@/lib/http/agent";
import { deploymentArtifact } from "@/modules/serveros/agent-service";

export const GET = agentRoute<{ id: string }>(async ({ ctx, agent, params }) => {
  const obj = await deploymentArtifact(ctx, agent, params.id);
  return new Response(obj.body, { headers: { "content-type": "application/zip", "cache-control": "no-store" } });
});
