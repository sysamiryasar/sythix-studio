import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { runHealthChecks } from "@/modules/service";
import { recordAudit } from "@/lib/audit";

export const POST = route({}, async ({ ctx, user }) => {
  requirePlatform(user, "platform.modules.manage");
  await runHealthChecks(ctx);
  await recordAudit(ctx, { actorId: user.id, action: "module.health_checked" });
  return { ok: true };
});
