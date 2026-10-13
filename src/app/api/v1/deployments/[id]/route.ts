import { route } from "@/lib/http/api";
import { getDeployment } from "@/modules/ecosystem/deployments";

export const GET = route<{ id: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => getDeployment(ctx, user, params.id));
