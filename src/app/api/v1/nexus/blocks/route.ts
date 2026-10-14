import { z } from "zod";
import { route } from "@/lib/http/api";
import { blockUser, listBlocks } from "@/modules/nexusid/social";

export const GET = route({ module: "nexusid" }, async ({ ctx, user }) => listBlocks(ctx, user.id));
export const POST = route({ module: "nexusid" }, async ({ ctx, user, body }) => {
  const { username } = await body(z.object({ username: z.string().trim().min(1).max(32) }));
  await blockUser(ctx, user, username);
  return { ok: true };
});
