"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Activity } from "lucide-react";
import { api } from "@/lib/client/api";
import type { FlagState } from "@/modules/service";
import type { IconName } from "@/modules/types";
import type { RegistryIssue } from "@/modules/registry";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import { ModuleIcon } from "@/components/ui/icon";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface ModuleView {
  id: string;
  name: string;
  description: string;
  version: string;
  installedVersion: string | null;
  core: boolean;
  enabled: boolean;
  available: boolean;
  reasons: string[];
  health: { status: string; detail: string | null; checkedAt: number | null };
  dependencies: Record<string, string>;
  platform: string;
  migrations: string[];
  permissions: string[];
  icon: IconName;
}

const HEALTH_TONE = { healthy: "success", degraded: "warning", unavailable: "danger", unknown: "neutral" } as const;

export function ModuleManager({ modules, flags, issues, canManage, canFlags }: { modules: ModuleView[]; flags: FlagState[]; issues: RegistryIssue[]; canManage: boolean; canFlags: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-6">
      {issues.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {issues.map((i, k) => <p key={k}>{i.moduleId}: {i.message}</p>)}
        </div>
      )}
      <div className="flex justify-end">
        {canManage && (
          <Button size="sm" variant="outline" loading={busy === "health"} onClick={() => act("health", () => api("/api/v1/studio/health", { body: {} }), "Health checks completed")}>
            <Activity className="h-3.5 w-3.5" /> Run health checks
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {modules.map((m) => (
          <Panel key={m.id}>
            <PanelBody>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <ModuleIcon name={m.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="font-mono text-xs text-faint">{m.id}@{m.version}</span>
                    {m.core && <Badge>Core</Badge>}
                    {m.available ? <Badge tone="success">Available</Badge> : <Badge tone="warning">Unavailable</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{m.description}</p>
                </div>
                {canManage && !m.core && (
                  <Switch label={`${m.enabled ? "Disable" : "Enable"} ${m.name}`} checked={m.enabled} disabled={busy === m.id} onChange={(v) => act(m.id, () => api(`/api/v1/studio/modules/${m.id}`, { method: "PATCH", body: { enabled: v } }), `${m.name} ${v ? "enabled" : "disabled"}`)} />
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-faint">Health</dt>
                <dd className="flex items-center gap-1.5">
                  <StatusDot tone={HEALTH_TONE[m.health.status as keyof typeof HEALTH_TONE] ?? "neutral"} label={m.health.status} /> {m.health.status}
                  {m.health.checkedAt && <span className="text-faint">· <RelativeTime ts={m.health.checkedAt} /></span>}
                </dd>
                {m.health.detail && (<><dt className="text-faint">Detail</dt><dd className="text-muted">{m.health.detail}</dd></>)}
                <dt className="text-faint">Installed</dt>
                <dd>{m.installedVersion ?? "—"}{m.installedVersion && m.installedVersion !== m.version && <Badge tone="info" className="ml-1">upgrade to {m.version}</Badge>}</dd>
                <dt className="text-faint">Platform</dt>
                <dd className="font-mono">{m.platform}</dd>
                <dt className="text-faint">Depends on</dt>
                <dd className="font-mono">{Object.entries(m.dependencies).map(([k, v]) => `${k}@${v}`).join(", ") || "—"}</dd>
                <dt className="text-faint">Migrations</dt>
                <dd className="font-mono">{m.migrations.join(", ")}</dd>
                <dt className="text-faint">Permissions</dt>
                <dd className="text-muted">{m.permissions.length}</dd>
              </dl>
              {m.reasons.length > 0 && <div className="mt-3 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">{m.reasons.join(" ")}</div>}
            </PanelBody>
          </Panel>
        ))}
      </div>
      <Panel>
        <PanelHeader title="Feature flags" description="Global overrides of module defaults. Changes are audited." />
        <ul className="divide-y divide-border">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs">{f.key}</div>
                <div className="text-xs text-muted">{f.description}</div>
              </div>
              {f.globalOverride !== null && <Badge tone="info">Overridden</Badge>}
              <Switch label={f.key} checked={f.enabled} disabled={!canFlags || busy === f.key} onChange={(v) => act(f.key, () => api("/api/v1/studio/flags", { method: "PATCH", body: { key: f.key, enabled: v === f.defaultEnabled ? null : v } }), "Flag updated")} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
