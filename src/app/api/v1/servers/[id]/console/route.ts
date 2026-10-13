import { z } from "zod";
import { route } from "@/lib/http/api";
import { getConsole } from "@/modules/serveros/reads";
import { queueCommand } from "@/modules/serveros/commands";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params, query }) => getConsole(ctx, user, params.id, Number(query.get("after") ?? 0) || 0, query.get("level") ?? undefined));
export const POST = route<P>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const { command } = await body(z.object({ command: z.string().max(300) }));
  return queueCommand(ctx, user, params.id, "console.command", { command });
});
