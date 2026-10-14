import { z } from "zod";
import { route } from "@/lib/http/api";
import { removeFriendship, respondToFriendRequest } from "@/modules/nexusid/social";

export const POST = route<{ id: string }>({ module: "nexusid" }, async ({ ctx, user, body, params }) => {
  const { action } = await body(z.object({ action: z.enum(["accept", "decline"]) }));
  await respondToFriendRequest(ctx, user, params.id, action);
  return { ok: true };
});
export const DELETE = route<{ id: string }>({ module: "nexusid" }, async ({ ctx, user, params }) => {
  await removeFriendship(ctx, user, params.id);
  return { ok: true };
});
