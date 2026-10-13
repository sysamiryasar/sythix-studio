import { z } from "zod";
import { route } from "@/lib/http/api";
import { confirmDeployment } from "@/modules/ecosystem/deployments";

export const POST = route<{ id: string }>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const { confirmText } = await body(z.object({ confirmText: z.string().max(64).optional() }));
  return confirmDeployment(ctx, user, params.id, confirmText);
});
