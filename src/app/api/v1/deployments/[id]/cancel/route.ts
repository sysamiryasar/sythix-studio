import { route } from "@/lib/http/api";
import { cancelDeployment } from "@/modules/ecosystem/deployments";

export const POST = route<{ id: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await cancelDeployment(ctx, user, params.id);
  return { ok: true };
});
