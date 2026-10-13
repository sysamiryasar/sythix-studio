import { z } from "zod";
import { route } from "@/lib/http/api";
import { verifyEmail } from "@/lib/auth/service";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => {
  const { token } = await body(z.object({ token: z.string().min(10).max(200) }));
  await verifyEmail(ctx, token);
  return { verified: true };
});
