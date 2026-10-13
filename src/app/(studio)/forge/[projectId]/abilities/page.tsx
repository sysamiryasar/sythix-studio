import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { AbilitiesEditor } from "@/components/forge/abilities-editor";

export default async function AbilitiesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const c = (await loadProjectContent(ctx, projectId))!;
  return <AbilitiesEditor projectId={projectId} abilities={c.abilities} canEdit={workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit")} />;
}
