import { route } from "@/lib/http/api";
import { badRequest } from "@/lib/errors";
import { restoreRevision } from "@/modules/forgeos/projects";

/** POST = restore this revision (creates a new revision with the restored content). */
export const POST = route<{ id: string; revision: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  const n = Number(params.revision);
  if (!Number.isInteger(n) || n < 1) throw badRequest("Invalid revision.");
  return { revision: await restoreRevision(ctx, user, params.id, n) };
});
