import { agentRoute } from "@/lib/http/agent";
import { readJson } from "@/lib/http/api";
import { heartbeatSchema } from "@/modules/serveros/protocol";
import { processHeartbeat } from "@/modules/serveros/agent-service";

export const POST = agentRoute(async ({ req, ctx, agent }) => processHeartbeat(ctx, agent, await readJson(req, heartbeatSchema)));
