import { route } from "@/lib/http/api";
import { getPreferences, preferencesInput, updatePreferences } from "@/modules/studio/preferences";

export const GET = route({}, async ({ ctx, user }) => getPreferences(ctx, user.id));
export const PATCH = route({}, async ({ ctx, user, body }) => updatePreferences(ctx, user.id, await body(preferencesInput)));
