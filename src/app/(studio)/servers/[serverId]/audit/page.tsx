import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { getServerAudit } from "@/modules/serveros/reads";
import { serverCan } from "@/lib/authz/roles";
import { AuditTable } from "@/components/studio/audit-table";

export default async function ServerAuditPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  if (!serverCan(s.role, "server.audit.read")) notFound();
  return <AuditTable rows={await getServerAudit(ctx, user, serverId)} />;
}
