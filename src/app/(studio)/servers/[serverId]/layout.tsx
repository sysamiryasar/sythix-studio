import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { serverCan } from "@/lib/authz/roles";
import { AppError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/panel";
import { RouteTabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ConnectionBadge } from "@/components/servers/status";

export default async function ServerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId).catch((e) => {
    if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  });
  const base = `/servers/${s.id}`;
  const can = (p: Parameters<typeof serverCan>[1]) => serverCan(s.role, p);
  const tabs = [
    { href: base, label: "Overview", exact: true },
    ...(can("server.console.read") ? [{ href: `${base}/console`, label: "Console" }] : []),
    { href: `${base}/players`, label: "Players" },
    ...(can("server.plugins.read") ? [{ href: `${base}/plugins`, label: "Plugins" }] : []),
    { href: `${base}/deployments`, label: "Deployments" },
    { href: `${base}/access`, label: "Access" },
    ...(can("server.audit.read") ? [{ href: `${base}/audit`, label: "Audit" }] : []),
    ...(can("server.manage") ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];
  return (
    <div>
      <PageHeader
        eyebrow={`ServerOS · ${s.environment}`}
        title={s.name}
        description={[s.address, `${s.software} ${s.mc_version}`].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <ConnectionBadge c={s.connection} />
            <Badge>{s.role?.replace("server_", "")}</Badge>
          </div>
        }
      />
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
