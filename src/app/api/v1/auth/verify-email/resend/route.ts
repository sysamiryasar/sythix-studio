import { z } from "zod";
import { route } from "@/lib/http/api";
import { resendVerification } from "@/lib/auth/service";
import { emailSchema } from "@/lib/validation";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => {
  const { email } = await body(z.object({ email: emailSchema }));
  await resendVerification(ctx, email);
  return { status: "sent_if_applicable" };
});
