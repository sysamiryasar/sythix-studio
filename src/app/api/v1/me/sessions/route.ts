import { route } from "@/lib/http/api";
import { listSessions, revokeAllSessions } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export const GET = route({}, async ({ ctx, user }) => ({
  current: user.sessionId,
  sessions: await listSessions(ctx, user.id),
}));

/** Sign out every other session. */
export const DELETE = route({}, async ({ ctx, user }) => {
  const n = await revokeAllSessions(ctx, user.id, user.sessionId);
  await recordAudit(ctx, { actorId: user.id, action: "account.sessions_revoked", targetType: "user", targetId: user.id, metadata: { count: n } });
  return { revoked: n };
});
