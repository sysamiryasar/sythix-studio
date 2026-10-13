import { requireUser } from "@/lib/auth/current";
import { all } from "@/lib/db/sql";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { validateContent } from "@/modules/forgeos/validate";
import { EXPORT_FORMATS } from "@/modules/forgeos/export";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { ExportPanel } from "@/components/forge/export-panel";

export default async function ExportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const role = await workspaceRole(ctx, user.id, project.workspace_id);
  const report = validateContent((await loadProjectContent(ctx, projectId))!);
  const exports = await all<{ id: string; revision: number; format: string; target_version: string; status: string; size_bytes: number | null; sha256: string | null; created_at: number; author: string }>(
    ctx.db,
    `SELECT e.id, e.revision, e.format, e.target_version, e.status, e.size_bytes, e.sha256, e.created_at, u.username AS author
       FROM export_jobs e JOIN users u ON u.id = e.created_by WHERE e.project_id = ? ORDER BY e.created_at DESC LIMIT 30`,
    projectId,
  );
  return (
    <ExportPanel
      projectId={projectId}
      report={report}
      formats={EXPORT_FORMATS}
      exports={exports}
      canExport={workspaceCan(role, "project.export")}
      canDeploy={workspaceCan(role, "project.deploy.request")}
    />
  );
}
