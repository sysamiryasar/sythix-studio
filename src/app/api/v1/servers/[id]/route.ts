import { route } from "@/lib/http/api";
import { deleteServer, getServer, serverInput, updateServer } from "@/modules/serveros/servers";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => getServer(ctx, user, params.id));
export const PATCH = route<P>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  await updateServer(ctx, user, params.id, await body(serverInput.partial()));
  return { ok: true };
});
export const DELETE = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => {
  await deleteServer(ctx, user, params.id);
  return { ok: true };
});
