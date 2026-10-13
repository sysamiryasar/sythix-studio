import { z } from "zod";
import { route } from "@/lib/http/api";
import { badRequest } from "@/lib/errors";
import { leaveTeam, removeMember, respondToInvite } from "@/modules/nexusid/teams";

/** The signed-in user answering their own invitation ("me"). */
export const POST = route<{ id: string; userId: string }>({ module: "nexusid" }, async ({ ctx, user, params, body }) => {
  const { action } = await body(z.object({ action: z.enum(["accept", "decline"]) }));
  if (params.userId !== "me") throw badRequest("Only 'me' may respond to an invitation.");
  await respondToInvite(ctx, user, params.id, action);
  return { ok: true };
});

export const DELETE = route<{ id: string; userId: string }>({ module: "nexusid" }, async ({ ctx, user, params }) => {
  if (params.userId === "me" || params.userId === user.id) await leaveTeam(ctx, user, params.id);
  else await removeMember(ctx, user, params.id, params.userId);
  return { ok: true };
});
