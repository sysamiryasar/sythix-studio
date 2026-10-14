import { z } from "zod";
import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { resolveReport } from "@/modules/nexusid/social";

export const PATCH = route<{ id: string }>({}, async ({ ctx, user, params, body }) => {
  requirePlatform(user, "platform.reports.review");
  const { status } = await body(z.object({ status: z.enum(["resolved", "dismissed"]) }));
  await resolveReport(ctx, user, params.id, status);
  return { ok: true };
});
