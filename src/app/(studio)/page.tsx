import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Hammer, Package, Server } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { loadHome } from "@/modules/studio/home";
import { formatRelative } from "@/lib/format";
import { Badge, StatusDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Panel, PanelHeader, Stat } from "@/components/ui/panel";
import { ConnectionBadge } from "@/components/servers/status";
import { ModuleIcon } from "@/components/ui/icon";
import { getManifest } from "@/modules";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioHome() {
  const { user, ctx } = await requireUser();
  const { current } = await resolveCurrentWorkspace(ctx, user);
  const h = await loadHome(ctx, user, current.id);
  const online = h.servers.filter((s) => s.connection.state === "online").length;
  return (
    <div className="space-y-6">
      <section className="sx-voxel-grid relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-5 sm:px-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-[90px]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{current.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {user.displayName}</h1>
            <p className="mt-1 text-sm text-muted">Press <kbd className="rounded border border-border-strong px-1 font-mono text-xs">Ctrl K</kbd> to search or run a command.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/forge?new=1" variant="primary"><Hammer className="h-4 w-4" /> New project</ButtonLink>
            <ButtonLink href="/servers/new" variant="outline"><Server className="h-4 w-4" /> Register server</ButtonLink>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects" value={h.projects.length} hint={`in ${current.name}`} />
        <Stat label="Servers online" value={`${online} / ${h.servers.length}`} hint="with a live agent" />
        <Stat label="Exports" value={h.exports.filter((e) => e.status === "succeeded").length} hint="your recent successful exports" />
        <Stat label="Achievements" value={h.achievements ? `${h.achievements.n} / ${h.achievements.total}` : "—"} hint="NexusID" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel>
            <PanelHeader title="Recent projects" actions={<Link href="/forge" className="text-xs text-accent hover:underline">All projects</Link>} />
            {h.projects.length === 0 ? (
              <div className="p-4"><EmptyState icon={<Hammer className="h-6 w-6" />} title="No projects yet" action={<ButtonLink href="/forge?new=1" variant="primary" size="sm">Create a project</ButtonLink>} /></div>
            ) : (
              <ul className="divide-y divide-border">
                {h.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/forge/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <Hammer className="h-4 w-4 text-accent" />
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      <span className="text-xs text-faint">{p.item_count} item{p.item_count === 1 ? "" : "s"} · Java {p.target_version} · {formatRelative(p.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Servers" actions={<Link href="/servers" className="text-xs text-accent hover:underline">ServerOS</Link>} />
            {h.servers.length === 0 ? (
              <div className="p-4 text-sm text-muted">No servers you have access to.</div>
            ) : (
              <ul className="divide-y divide-border">
                {h.servers.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link href={`/servers/${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <Server className="h-4 w-4 text-cyan" />
                      <span className="flex-1 truncate text-sm">{s.name}</span>
                      <ConnectionBadge c={s.connection} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Recent exports" />
            {h.exports.length === 0 ? (
              <div className="p-4 text-sm text-muted">No exports yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {h.exports.map((e) => (
                  <li key={e.id}>
                    <Link href={`/forge/${e.project_id}/exports`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <Package className="h-4 w-4 text-faint" />
                      <span className="flex-1 truncate text-sm">{e.name} · {e.format} r{e.revision}</span>
                      <Badge tone={e.status === "succeeded" ? "success" : "danger"}>{e.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Pending tasks" />
            {h.tasks.length === 0 ? (
              <div className="p-4 text-sm text-muted">Nothing needs your attention.</div>
            ) : (
              <ul className="divide-y divide-border">
                {h.tasks.map((t, i) => (
                  <li key={i}>
                    <Link href={t.href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="mt-1.5"><StatusDot tone={t.tone} label={t.tone} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{t.title}</span>
                        <span className="block text-xs text-muted">{t.detail}</span>
                      </span>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Notifications" actions={<Link href="/notifications" className="text-xs text-accent hover:underline">All</Link>} />
            <ul className="divide-y divide-border">
              {h.notifications.length === 0 && <li className="px-4 py-3 text-sm text-muted">No notifications.</li>}
              {h.notifications.map((n) => (
                <li key={n.id} className="px-4 py-2.5">
                  <Link href={n.link ?? "/notifications"} className="block hover:underline">
                    <span className="text-sm">{n.title}</span>
                  </Link>
                  <span className="text-[11px] text-faint">{formatRelative(n.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Connected tools" actions={<Link href="/studio/modules" className="text-xs text-accent hover:underline">Modules</Link>} />
            <ul className="divide-y divide-border">
              {h.modules.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <ModuleIcon name={getManifest(m.id)?.icon ?? "puzzle"} className="h-4 w-4 text-faint" />
                  <span className="flex-1">{m.name} <span className="text-xs text-faint">v{m.version}</span></span>
                  {m.available ? <Badge tone="success">Available</Badge> : <Badge tone="warning">Unavailable</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
