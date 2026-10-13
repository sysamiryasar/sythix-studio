import { z } from "zod";
import { route } from "@/lib/http/api";
import { changePassword } from "@/lib/auth/service";
import { passwordSchema } from "@/lib/validation";

export const POST = route({}, async ({ ctx, user, body }) => {
  const { currentPassword, newPassword } = await body(z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }));
  await changePassword(ctx, user, currentPassword, newPassword);
  return { changed: true };
});
