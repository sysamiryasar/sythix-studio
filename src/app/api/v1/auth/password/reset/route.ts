import { z } from "zod";
import { route } from "@/lib/http/api";
import { resetPassword } from "@/lib/auth/service";
import { passwordSchema } from "@/lib/validation";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => {
  const { token, password } = await body(z.object({ token: z.string().min(10).max(200), password: passwordSchema }));
  await resetPassword(ctx, token, password);
  return { reset: true };
});
