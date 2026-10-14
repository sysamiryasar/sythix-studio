import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { RELEASE, CHANGELOG_MD } from "@/generated/release";
import { getModuleStates, registryIssues } from "@/modules/service";
import { checkForUpdates } from "@/modules/studio/updates";
import { all } from "@/lib/db/sql";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel, PanelBody, PanelHeader, Stat } from "@/components/ui/panel";
import { Markdown } from "@/components/studio/markdown";

export const metadata: Metadata = { title: "Updates" };

export default async function UpdatesPage() {
  const { ctx } = await requireUser();
  const [states, check, migrations] = await Promise.all([
    getModuleStates(ctx),
    checkForUpdates(ctx),
    all<{ name: string; applied_at: string }>(ctx.db, `SELECT name, applied_at FROM d1_migrations ORDER BY id`).catch(() => []),
  ]);
  const issues = registryIssues();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Studio" title="Updates" description="Installed versions, release status and changelog. Upgrades are applied only through the reviewed GitHub release workflow — never from this page." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Platform version" value={`v${RELEASE.version}`} hint={`commit ${RELEASE.commit.slice(0, 7)}`} />
        <Stat label="Built" value={RELEASE.builtAt.slice(0, 10)} hint={RELEASE.builtAt.slice(11, 16) + " UTC"} />
        <Stat label="Environment" value={ctx.env.APP_ENV} hint={ctx.env.DEPLOYMENT_LABEL ?? "deployment label not set"} />
        <Stat label="Migrations applied" value={migrations.length} hint={migrations.at(-1)?.name ?? "—"} />
      </div>
      <Panel>
        <PanelHeader
          title="Available updates"
          actions={
            check.status === "update_available" ? <Badge tone="accent">Update available</Badge> : check.status === "up_to_date" ? <Badge tone="success">Up to date</Badge> : <Badge>Not checked</Badge>
          }
        />
        <PanelBody className="text-sm">
          <p className="text-muted">{check.detail}</p>
          {check.latest && (
            <p className="mt-1">
              Latest: <a className="text-accent hover:underline" href={check.latest.url} rel="noreferrer noopener" target="_blank">{check.latest.name}</a> ({check.latest.publishedAt.slice(0, 10)})
            </p>
          )}
          <p className="mt-2 text-xs text-faint">To upgrade: merge the release PR, tag vX.Y.Z, approve the production environment in GitHub Actions. Migrations run before the new Worker version is deployed; see docs/RELEASING.md for rollback.</p>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Module versions and compatibility" />
        <ul className="divide-y divide-border text-sm">
          {states.map((s) => (
            <li key={s.manifest.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="flex-1">{s.manifest.name}</span>
              <span className="font-mono text-xs text-muted">v{s.manifest.version}</span>
              <span className="font-mono text-xs text-faint">platform {s.manifest.platform}</span>
              {s.available ? <Badge tone="success">Compatible</Badge> : <Badge tone="warning" title={s.reasons.join(" ")}>Attention</Badge>}
            </li>
          ))}
        </ul>
        {issues.length > 0 && <PanelBody className="border-t border-border text-xs text-warning">{issues.map((i, k) => <p key={k}>{i.moduleId}: {i.message}</p>)}</PanelBody>}
      </Panel>
      <Panel>
        <PanelHeader title="Applied database migrations" />
        <ul className="divide-y divide-border font-mono text-xs">
          {migrations.map((m) => (
            <li key={m.name} className="flex justify-between px-4 py-2"><span>{m.name}</span><span className="text-faint">{m.applied_at ? formatDateTime(Date.parse(m.applied_at + "Z")) : ""}</span></li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <PanelHeader title="Changelog" />
        <PanelBody>
          <Markdown source={CHANGELOG_MD} />
        </PanelBody>
      </Panel>
    </div>
  );
}
