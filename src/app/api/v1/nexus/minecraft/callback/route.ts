import { route } from "@/lib/http/api";
import { completeLink } from "@/modules/nexusid/minecraft";

export const GET = route({ module: "nexusid" }, async ({ ctx, user, query, req }) => {
  const back = (status: string) => Response.redirect(new URL(`/settings?minecraft=${status}`, req.url).toString(), 302);
  const code = query.get("code");
  const state = query.get("state");
  if (query.get("error") || !code || !state) return back("cancelled");
  try {
    await completeLink(ctx, user.id, code, state);
    return back("linked");
  } catch {
    return back("failed");
  }
});
