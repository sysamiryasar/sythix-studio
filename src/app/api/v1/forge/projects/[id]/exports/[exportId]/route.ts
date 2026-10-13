import { route } from "@/lib/http/api";
import { notFound } from "@/lib/errors";
import { requireProject } from "@/modules/forgeos/projects";
import { getExportFile } from "@/modules/forgeos/export";

export const GET = route<{ id: string; exportId: string }>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  await requireProject(ctx, user, params.id, "project.view");
  const f = await getExportFile(ctx, params.exportId, params.id);
  if (!f) throw notFound("Export");
  return new Response(f.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${f.filename}"`,
      "x-sythix-sha256": f.sha256,
      "cache-control": "private, no-store",
    },
  });
});
