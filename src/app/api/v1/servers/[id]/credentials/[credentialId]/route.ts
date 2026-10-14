import { route } from "@/lib/http/api";
import { revokeCredential } from "@/modules/serveros/credentials";

export const DELETE = route<{ id: string; credentialId: string }>({ module: "serveros" }, async ({ ctx, user, params }) => {
  await revokeCredential(ctx, user, params.id, params.credentialId);
  return { ok: true };
});
