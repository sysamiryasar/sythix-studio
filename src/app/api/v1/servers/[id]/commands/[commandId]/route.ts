import { route } from "@/lib/http/api";
import { getCommand } from "@/modules/serveros/commands";

export const GET = route<{ id: string; commandId: string }>({ module: "serveros" }, async ({ ctx, user, params }) => getCommand(ctx, user, params.id, params.commandId));
