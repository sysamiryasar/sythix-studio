import { route } from "@/lib/http/api";
import { revokeSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notFound } from "@/lib/errors";

export const DELETE = route<{ id: string }>({}, async ({ ctx, user, params }) => {
  if (!(await revokeSession(ctx, user.id, params.id))) throw notFound("Session");
  await recordAudit(ctx, { actorId: user.id, action: "account.session_revoked", targetType: "session", targetId: params.id });
  return { revoked: true };
});
