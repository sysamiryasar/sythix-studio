import { route } from "@/lib/http/api";
import { unblockUser } from "@/modules/nexusid/social";

export const DELETE = route<{ userId: string }>({ module: "nexusid" }, async ({ ctx, user, params }) => {
  await unblockUser(ctx, user, params.userId);
  return { ok: true };
});
