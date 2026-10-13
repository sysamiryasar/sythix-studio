import { z } from "zod";
import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { listFlags, setFlag } from "@/modules/service";

export const GET = route({}, async ({ ctx }) => listFlags(ctx));
export const PATCH = route({}, async ({ ctx, user, body }) => {
  requirePlatform(user, "platform.flags.manage");
  const { key, enabled } = await body(z.object({ key: z.string().max(80), enabled: z.boolean().nullable() }));
  await setFlag(ctx, user.id, key, enabled);
  return { ok: true };
});
