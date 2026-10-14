import { route } from "@/lib/http/api";
import { deleteTeam } from "@/modules/nexusid/teams";

export const DELETE = route<{ id: string }>({ module: "nexusid" }, async ({ ctx, user, params }) => {
  await deleteTeam(ctx, user, params.id);
  return { ok: true };
});
