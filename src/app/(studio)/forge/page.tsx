import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { listProjects } from "@/modules/forgeos/projects";
import { workspaceCan } from "@/lib/authz/roles";
import { TARGET_VERSIONS, DEFAULT_TARGET } from "@/modules/forgeos/versions";
import { ProjectList } from "@/components/forge/project-list";

export const metadata: Metadata = { title: "ForgeOS" };

export default async function ForgePage({ searchParams }: { searchParams: Promise<{ new?: string; archived?: string }> }) {
  const sp = await searchParams;
  const { user, ctx } = await requireUser();
  const { current } = await resolveCurrentWorkspace(ctx, user);
  const projects = await listProjects(ctx, user, current.id, sp.archived === "1");
  return (
    <ProjectList
      workspaceName={current.name}
      projects={projects}
      canCreate={workspaceCan(current.role, "project.create")}
      canDelete={workspaceCan(current.role, "project.delete")}
      targets={TARGET_VERSIONS.map((t) => ({ id: t.id, label: t.label }))}
      defaultTarget={DEFAULT_TARGET}
      openNew={sp.new === "1"}
      showArchived={sp.archived === "1"}
    />
  );
}
