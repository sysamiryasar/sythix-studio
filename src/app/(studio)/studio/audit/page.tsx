import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { all } from "@/lib/db/sql";
import { platformCan, workspaceCan } from "@/lib/authz/roles";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { PageHeader } from "@/components/ui/panel";
import { RouteTabs } from "@/components/ui/tabs";
import { AuditTable, type AuditRow } from "@/components/studio/audit-table";

export const metadata: Metadata = { title: "Audit log" };

const SELECT = `SELECT a.id, a.actor_type, COALESCE(u.username, a.actor_id) AS actor, a.action, a.metadata, a.created_at, a.ip FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id`;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "me" } = await searchParams;
  const { user, ctx } = await requireUser();
  const { current } = await resolveCurrentWorkspace(ctx, user);
  const canWs = workspaceCan(current.role, "audit.read");
  const canPlatform = platformCan(user.platformRole, "platform.audit.read");
  let rows: AuditRow[];
  if (scope === "platform" && canPlatform) rows = await all<AuditRow>(ctx.db, `${SELECT} ORDER BY a.created_at DESC LIMIT 300`);
  else if (scope === "workspace" && canWs) rows = await all<AuditRow>(ctx.db, `${SELECT} WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 300`, current.id);
  else rows = await all<AuditRow>(ctx.db, `${SELECT} WHERE a.actor_id = ? ORDER BY a.created_at DESC LIMIT 300`, user.id);
  return (
    <div>
      <PageHeader eyebrow="Studio" title="Audit log" description="Append-only record of privileged actions. Server-specific events are also on each server's Audit tab." />
      <RouteTabs
        tabs={[
          { href: "/studio/audit", label: "My activity", exact: true },
          ...(canWs ? [{ href: "/studio/audit?scope=workspace", label: current.name, exact: true }] : []),
          ...(canPlatform ? [{ href: "/studio/audit?scope=platform", label: "Platform", exact: true }] : []),
        ]}
      />
      <AuditTable rows={rows} />
    </div>
  );
}
