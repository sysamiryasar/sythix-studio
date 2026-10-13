import { route } from "@/lib/http/api";
import { search } from "@/modules/ecosystem/search";

export const GET = route({}, async ({ ctx, user, query }) => ({ results: await search(ctx, user, query.get("q") ?? "") }));
