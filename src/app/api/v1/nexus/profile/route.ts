import { route } from "@/lib/http/api";
import { getProfile, profileInput, updateProfile } from "@/modules/nexusid/profiles";

export const GET = route({ module: "nexusid" }, async ({ ctx, user }) => getProfile(ctx, user.id));
export const PATCH = route({ module: "nexusid" }, async ({ ctx, user, body }) => updateProfile(ctx, user.id, await body(profileInput)));
