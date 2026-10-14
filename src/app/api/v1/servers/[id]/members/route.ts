import { z } from "zod";
import { route } from "@/lib/http/api";
import { listServerMembers, setServerMember } from "@/modules/serveros/servers";
import { SERVER_ROLES } from "@/lib/authz/roles";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => listServerMembers(ctx, user, params.id));
export const POST = route<P>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const { username, role } = await body(z.object({ username: z.string().trim().min(1).max(32), role: z.enum(SERVER_ROLES) }));
  await setServerMember(ctx, user, params.id, username, role);
  return { ok: true };
});
