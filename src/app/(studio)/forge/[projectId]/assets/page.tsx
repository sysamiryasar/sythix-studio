import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { workspaceRole } from "@/lib/authz/check";
import { workspaceCan } from "@/lib/authz/roles";
import { AssetsManager } from "@/components/forge/assets-manager";

export default async function AssetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const c = (await loadProjectContent(ctx, projectId))!;
  const usage = (id: string) => c.items.filter((i) => i.texture_asset_id === id || i.data.modelAssetId === id).map((i) => i.identifier);
  return (
    <AssetsManager
      projectId={projectId}
      assets={c.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, size: a.size_bytes, width: a.width, height: a.height, usedBy: usage(a.id), model: a.kind === "model" ? (a.metadata.model as object) : null, textureRefs: (a.metadata.textureRefs as string[]) ?? [] }))}
      canEdit={workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit")}
    />
  );
}
