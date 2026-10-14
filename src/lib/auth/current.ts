import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppContext, type AppContext } from "../context";
import { resolveSession, sessionCookieName, type SessionUser } from "./session";

/** Per-request app context for Server Components. */
export const getServerContext = cache(async (): Promise<AppContext> => {
  // Give the context the incoming request's headers (host for APP_URL, client IP, user agent).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  return getAppContext(new Request(`https://${host}/`, { headers: new Headers(h) }));
});

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const ctx = await getServerContext();
  const jar = await cookies();
  return resolveSession(ctx, jar.get(sessionCookieName(ctx.env))?.value);
});

export async function requireUser(): Promise<{ user: SessionUser; ctx: AppContext }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, ctx: await getServerContext() };
}
