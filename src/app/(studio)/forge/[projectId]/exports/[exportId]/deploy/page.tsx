import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { one } from "@/lib/db/sql";
import { requireProject } from "@/modules/forgeos/projects";
import { deployableServers } from "@/modules/ecosystem/deployments";
import { isModuleAvailable } from "@/modules/service";
import { DeployFlow } from "@/components/ecosystem/deploy-flow";

export default async function DeployPage({ params }: { params: Promise<{ projectId: string; exportId: string }> }) {
  const { projectId, exportId } = await params;
  const { user, ctx } = await requireUser();
  await requireProject(ctx, user, projectId, "project.deploy.request");
  const exp = await one<{ id: string; revision: number; format: string; target_version: string; status: string; sha256: string }>(
    ctx.db,
    `SELECT id, revision, format, target_version, status, sha256 FROM export_jobs WHERE id = ? AND project_id = ?`,
    exportId,
    projectId,
  );
  if (!exp || exp.status !== "succeeded") notFound();
  const servers = (await isModuleAvailable(ctx, "serveros")) ? await deployableServers(ctx, user) : [];
  return <DeployFlow projectId={projectId} exp={exp} servers={servers} />;
}
