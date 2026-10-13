import { z } from "zod";
import { route } from "@/lib/http/api";
import { listMyServers, registerServer, serverInput } from "@/modules/serveros/servers";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";

export const GET = route({ module: "serveros" }, async ({ ctx, user }) => listMyServers(ctx, user));
export const POST = route({ module: "serveros" }, async ({ ctx, user, body }) => {
  const input = await body(serverInput.extend({ workspaceId: z.string().max(64).optional() }));
  return registerServer(ctx, user, input.workspaceId ?? (await resolveCurrentWorkspace(ctx, user)).current.id, input);
});
