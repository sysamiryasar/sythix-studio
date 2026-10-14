import { route } from "@/lib/http/api";
import { getServerAudit } from "@/modules/serveros/reads";

export const GET = route<{ id: string }>({ module: "serveros" }, async ({ ctx, user, params }) => getServerAudit(ctx, user, params.id));
