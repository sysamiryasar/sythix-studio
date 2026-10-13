import { route } from "@/lib/http/api";
import { createReport, reportInput } from "@/modules/nexusid/social";

export const POST = route({ module: "nexusid" }, async ({ ctx, user, body }) => createReport(ctx, user, await body(reportInput)));
