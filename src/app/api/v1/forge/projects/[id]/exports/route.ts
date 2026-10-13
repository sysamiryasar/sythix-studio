import { z } from "zod";
import { route } from "@/lib/http/api";
import { all } from "@/lib/db/sql";
import { requireProject } from "@/modules/forgeos/projects";
import { runExport } from "@/modules/forgeos/export";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

type P = { id: string };

export const GET = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await requireProject(ctx, user, params.id, "project.view");
  return all(
    ctx.db,
    `SELECT e.id, e.revision, e.format, e.target_version, e.status, e.size_bytes, e.sha256, e.created_at, u.username AS author
       FROM export_jobs e JOIN users u ON u.id = e.created_by WHERE e.project_id = ? ORDER BY e.created_at DESC LIMIT 50`,
    params.id,
  );
});

export const POST = route<P>({ module: "forgeos" }, async ({ ctx, user, params, body }) => {
  await requireProject(ctx, user, params.id, "project.export");
  await enforceRateLimit(ctx, RATE_LIMITS.export, user.id);
  const { format } = await body(z.object({ format: z.enum(["datapack", "resourcepack", "bundle"]) }));
  return runExport(ctx, user, params.id, format);
});
