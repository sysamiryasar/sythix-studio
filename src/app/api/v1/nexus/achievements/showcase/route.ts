import { z } from "zod";
import { route } from "@/lib/http/api";
import { setShowcase } from "@/modules/nexusid/achievements";

export const PUT = route({ module: "nexusid" }, async ({ ctx, user, body }) => {
  const { ids } = await body(z.object({ ids: z.array(z.string().max(64)).max(6) }));
  await setShowcase(ctx, user.id, ids);
  return { ok: true };
});
