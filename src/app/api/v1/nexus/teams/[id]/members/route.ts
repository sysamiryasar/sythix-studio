import { z } from "zod";
import { route } from "@/lib/http/api";
import { inviteToTeam } from "@/modules/nexusid/teams";

export const POST = route<{ id: string }>({ module: "nexusid" }, async ({ ctx, user, params, body }) => {
  const { username } = await body(z.object({ username: z.string().trim().min(1).max(32) }));
  await inviteToTeam(ctx, user, params.id, username);
  return { ok: true };
});
