import { clearSessionCookieHeader, jsonResponse, route } from "@/lib/http/api";
import { revokeSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export const POST = route({ auth: "optional" }, async ({ ctx, user }) => {
  if (user) {
    await revokeSession(ctx, user.id, user.sessionId);
    await recordAudit(ctx, { actorId: user.id, action: "account.logout", targetType: "session", targetId: user.sessionId });
  }
  return jsonResponse({ data: { ok: true } }, { headers: { "set-cookie": clearSessionCookieHeader(ctx.env) } });
});
