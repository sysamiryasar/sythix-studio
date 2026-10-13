import { z } from "zod";
import { route } from "@/lib/http/api";
import { planDeployment } from "@/modules/ecosystem/deployments";

/** Creates a reviewable deployment plan. Nothing is sent to the server until the plan is confirmed. */
export const POST = route({ module: "forgeos" }, async ({ ctx, user, body }) => {
  const input = await body(z.object({ projectId: z.string().max(64), exportId: z.string().max(64), serverId: z.string().max(64), reloadAfter: z.boolean().default(false) }));
  return planDeployment(ctx, user, input);
});
