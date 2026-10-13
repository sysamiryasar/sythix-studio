import { jsonResponse, route, sessionCookieHeader } from "@/lib/http/api";
import { login, loginInput } from "@/lib/auth/service";

export const POST = route({ auth: "none" }, async ({ ctx, body }) => {
  const { token, expiresAt } = await login(ctx, await body(loginInput));
  return jsonResponse({ data: { ok: true } }, { headers: { "set-cookie": sessionCookieHeader(ctx.env, token, expiresAt) } });
});
