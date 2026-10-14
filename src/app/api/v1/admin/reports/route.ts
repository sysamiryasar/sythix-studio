import { route } from "@/lib/http/api";
import { requirePlatform } from "@/lib/authz/check";
import { listReports } from "@/modules/nexusid/social";

export const GET = route({}, async ({ ctx, user, query }) => {
  requirePlatform(user, "platform.reports.review");
  const status = query.get("status");
  return listReports(ctx, status === "resolved" || status === "dismissed" ? status : "open");
});
