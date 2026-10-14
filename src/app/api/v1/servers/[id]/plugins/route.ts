import { route } from "@/lib/http/api";
import { getPlugins } from "@/modules/serveros/reads";
import { queueCommand } from "@/modules/serveros/commands";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => getPlugins(ctx, user, params.id));
/** Ask the agent to rescan the plugins folder. */
export const POST = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => queueCommand(ctx, user, params.id, "plugins.scan", {}));
