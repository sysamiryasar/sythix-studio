import { route } from "@/lib/http/api";
import { createTeam, listMyTeams, teamInput } from "@/modules/nexusid/teams";

export const GET = route({ module: "nexusid" }, async ({ ctx, user }) => listMyTeams(ctx, user.id));
export const POST = route({ module: "nexusid" }, async ({ ctx, user, body }) => createTeam(ctx, user, await body(teamInput)));
