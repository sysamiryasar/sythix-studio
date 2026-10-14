import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { adminVerifyUser } from "@/lib/auth/service";

export const POST = route<{ id: string }>({}, async ({ ctx, user, params }) => {
  requirePlatform(user, "platform.users.manage");
  await adminVerifyUser(ctx, user.id, params.id);
  return { ok: true };
});
