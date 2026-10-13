import { route } from "@/lib/http/api";
import { removeServerMember } from "@/modules/serveros/servers";

export const DELETE = route<{ id: string; userId: string }>({ module: "serveros" }, async ({ ctx, user, params }) => {
  await removeServerMember(ctx, user, params.id, params.userId);
  return { ok: true };
});
