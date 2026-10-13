import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { getMaterial } from "@/modules/forgeos/catalog";
import { SetsEditor } from "@/components/forge/sets-editor";

export default async function SetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const c = (await loadProjectContent(ctx, projectId))!;
  return (
    <SetsEditor
      projectId={projectId}
      sets={c.sets}
      armor={c.items.filter((i) => getMaterial(i.base_material)?.armorSlot).map((i) => ({ identifier: i.identifier, name: i.name, slot: getMaterial(i.base_material)!.armorSlot! }))}
      abilities={c.abilities.map((a) => ({ identifier: a.identifier, name: a.name }))}
      canEdit={workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit")}
    />
  );
}
