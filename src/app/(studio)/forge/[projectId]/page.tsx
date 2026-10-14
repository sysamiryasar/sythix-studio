import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { loadProjectContent } from "@/modules/forgeos/content";
import { requireProject } from "@/modules/forgeos/projects";
import { getMaterial } from "@/modules/forgeos/catalog";
import { validateContent } from "@/modules/forgeos/validate";
import { workspaceCan } from "@/lib/authz/roles";
import { workspaceRole } from "@/lib/authz/check";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/panel";

const RARITY = { common: "neutral", uncommon: "warning", rare: "info", epic: "accent" } as const;

export default async function ItemsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view");
  const canEdit = workspaceCan(await workspaceRole(ctx, user.id, project.workspace_id), "project.edit");
  const c = (await loadProjectContent(ctx, projectId))!;
  const report = validateContent(c);
  const issuesFor = (id: string) => report.issues.filter((i) => i.entity === `item:${id}`);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {c.items.length} item{c.items.length === 1 ? "" : "s"}
        </p>
        {canEdit && (
          <ButtonLink href={`/forge/${projectId}/items/new`} variant="primary">
            <Plus className="h-4 w-4" /> New item
          </ButtonLink>
        )}
      </div>
      {c.items.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="No items yet" description="Start with a weapon, tool, armor piece or consumable." />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {c.items.map((i) => {
              const iss = issuesFor(i.identifier);
              const errors = iss.filter((x) => x.severity === "error").length;
              const warnings = iss.filter((x) => x.severity === "warning").length;
              return (
                <li key={i.id}>
                  <Link href={`/forge/${projectId}/items/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    {i.texture_asset_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/v1/forge/projects/${projectId}/assets/${i.texture_asset_id}`} alt="" width={32} height={32} className="pixelated rounded border border-border bg-surface-2" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-border text-faint">
                        <Package className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" style={i.data.nameColor ? { color: i.data.nameColor } : undefined}>
                        {i.name}
                      </div>
                      <div className="truncate font-mono text-[11px] text-faint">
                        {c.project.namespace}:{i.identifier} · {getMaterial(i.base_material)?.label}
                      </div>
                    </div>
                    <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                      <Badge tone={RARITY[i.rarity]}>{i.rarity}</Badge>
                      {i.data.abilityIds.length > 0 && <Badge tone="warning" title="Requires SythiX Runtime (planned)">Runtime abilities</Badge>}
                      {errors > 0 && <Badge tone="danger">{errors} error{errors > 1 ? "s" : ""}</Badge>}
                      {!errors && warnings > 0 && <Badge tone="warning">{warnings} warning{warnings > 1 ? "s" : ""}</Badge>}
                      {!errors && !warnings && <Badge tone="success">Valid</Badge>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
