import { z } from "zod";
import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { setModuleEnabled } from "@/modules/service";

export const PATCH = route<{ id: string }>({}, async ({ ctx, user, params, body }) => {
  requirePlatform(user, "platform.modules.manage");
  const { enabled } = await body(z.object({ enabled: z.boolean() }));
  await setModuleEnabled(ctx, user.id, params.id, enabled);
  return { ok: true };
});
