import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Server } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listMyServers, listWorkspaceServers } from "@/modules/serveros/servers";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { workspaceCan } from "@/lib/authz/roles";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { ConnectionBadge } from "@/components/servers/status";

export const metadata: Metadata = { title: "ServerOS" };

export default async function ServersPage() {
  const { user, ctx } = await requireUser();
  const { current } = await resolveCurrentWorkspace(ctx, user);
  const mine = await listMyServers(ctx, user);
  const workspaceOnly = workspaceCan(current.role, "server.list") ? (await listWorkspaceServers(ctx, user, current.id)).filter((s) => !s.role) : [];
  const canRegister = workspaceCan(current.role, "server.register");
  return (
    <div>
      <PageHeader
        eyebrow="ServerOS"
        title="Servers"
        description="Paper and Purpur servers connected through the SythiX agent. Access is granted per server."
        actions={
          canRegister && (
            <ButtonLink href="/servers/new" variant="primary">
              <Plus className="h-4 w-4" /> Register server
            </ButtonLink>
          )
        }
      />
      {mine.length === 0 ? (
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title="No servers yet"
          description="Register a server, then run the SythiX agent next to it. You can also try a clearly-labelled simulated agent first."
          action={canRegister && <ButtonLink href="/servers/new" variant="primary">Register a server</ButtonLink>}
        />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {mine.map((s) => (
              <li key={s.id}>
                <Link href={`/servers/${s.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {s.name} {s.environment === "production" && <Badge tone="danger">production</Badge>}
                    </div>
                    <div className="text-xs text-faint">
                      {s.software} {s.mc_version} {s.address && `· ${s.address}`} · {s.role?.replace("server_", "")}
                    </div>
                  </div>
                  <ConnectionBadge c={s.connection} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {workspaceOnly.length > 0 && (
        <Panel className="mt-6">
          <div className="border-b border-border px-4 py-3 text-xs text-muted">
            Other servers in {current.name}. Your workspace role shows they exist, but you need a server role from one of their administrators to manage them.
          </div>
          <ul className="divide-y divide-border">
            {workspaceOnly.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{s.name}</span>
                <ConnectionBadge c={s.connection} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
