import { route } from "@/lib/http/api";
import { unlink } from "@/modules/nexusid/minecraft";

export const DELETE = route({ module: "nexusid" }, async ({ ctx, user }) => {
  await unlink(ctx, user.id);
  return { ok: true };
});
