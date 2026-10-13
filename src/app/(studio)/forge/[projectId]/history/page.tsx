import { requireUser } from "@/lib/auth/current";
import { listRevisions, requireProject } from "@/modules/forgeos/projects";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { HistoryPanel } from "@/components/forge/history-panel";

export default async function HistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  return <HistoryPanel projectId={projectId} revisions={await listRevisions(ctx, projectId)} current={project.current_revision} canEdit={workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit")} />;
}
