import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { requireProject } from "@/modules/forgeos/projects";
import { getTarget } from "@/modules/forgeos/versions";
import { PageHeader } from "@/components/ui/panel";
import { RouteTabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AppError } from "@/lib/errors";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, ctx } = await requireUser();
  const project = await requireProject(ctx, user, projectId, "project.view").catch((e) => {
    if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  });
  const base = `/forge/${project.id}`;
  return (
    <div>
      <PageHeader
        eyebrow={project.folder ? `ForgeOS · ${project.folder}` : "ForgeOS"}
        title={project.name}
        description={project.description || undefined}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">Java {getTarget(project.target_version)?.label ?? project.target_version}</Badge>
            <Badge>
              <span className="font-mono">{project.namespace}</span>
            </Badge>
            <Badge>Revision {project.current_revision}</Badge>
            {project.visibility === "public" && <Badge tone="accent">Public</Badge>}
            {project.archived_at && <Badge tone="warning">Archived</Badge>}
          </div>
        }
      />
      <RouteTabs
        tabs={[
          { href: base, label: "Items", exact: true },
          { href: `${base}/abilities`, label: "Abilities" },
          { href: `${base}/sets`, label: "Equipment sets" },
          { href: `${base}/assets`, label: "Assets" },
          { href: `${base}/exports`, label: "Validate & export" },
          { href: `${base}/history`, label: "History" },
          { href: `${base}/settings`, label: "Settings" },
        ]}
      />
      {children}
    </div>
  );
}
