import { z } from "zod";
import { route } from "@/lib/http/api";
import { issueCredential, listCredentials } from "@/modules/serveros/credentials";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => listCredentials(ctx, user, params.id));
/** Issues a new agent token. The plaintext token is returned exactly once. */
export const POST = route<P>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const { label, revokeOthers } = await body(z.object({ label: z.string().trim().max(64).default("Agent credential"), revokeOthers: z.boolean().default(false) }));
  return issueCredential(ctx, user, params.id, label, revokeOthers);
});
