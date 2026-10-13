import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { ItemEditor } from "@/components/forge/item-editor";

export default async function ItemPage({ params }: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const canEdit = workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit");
  const c = (await loadProjectContent(ctx, projectId))!;
  const item = itemId === "new" ? null : c.items.find((i) => i.id === itemId);
  if (itemId !== "new" && !item) notFound();
  return (
    <ItemEditor
      projectId={projectId}
      namespace={c.project.namespace}
      item={item ?? null}
      textures={c.assets.filter((a) => a.kind === "texture").map((a) => ({ id: a.id, name: a.name }))}
      models={c.assets.filter((a) => a.kind === "model").map((a) => ({ id: a.id, name: a.name, model: a.metadata.model as object }))}
      abilities={c.abilities.map((a) => ({ identifier: a.identifier, name: a.name }))}
      canEdit={canEdit}
    />
  );
}
