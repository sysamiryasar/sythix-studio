import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { TARGET_VERSIONS } from "@/modules/forgeos/versions";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { ProjectSettings } from "@/components/forge/project-settings";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const c = (await loadProjectContent(ctx, projectId))!;
  return (
    <ProjectSettings
      project={project}
      packDescription={c.pack.description}
      targets={TARGET_VERSIONS.map((t) => ({ id: t.id, label: t.label }))}
      canEdit={workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit")}
    />
  );
}
