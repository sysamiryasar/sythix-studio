import { z } from "zod";
import { route } from "@/lib/http/api";
import { requestPasswordReset } from "@/lib/auth/service";
import { emailSchema } from "@/lib/validation";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => {
  const { email, turnstileToken } = await body(z.object({ email: emailSchema, turnstileToken: z.string().max(4096).optional() }));
  await requestPasswordReset(ctx, email, turnstileToken);
  return { status: "sent_if_applicable" };
});
