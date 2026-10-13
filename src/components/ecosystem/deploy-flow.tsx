"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Rocket, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type { DeploymentPlan } from "@/modules/ecosystem/deployments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export function DeployFlow({ projectId, exp, servers }: { projectId: string; exp: { id: string; revision: number; format: string; target_version: string; sha256: string }; servers: { id: string; name: string; environment: string; mc_version: string }[] }) {
  const toast = useToast();
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const [reloadAfter, setReloadAfter] = useState(false);
  const [plan, setPlan] = useState<{ id: string; plan: DeploymentPlan } | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ status: string; result: { ok: boolean; data?: Record<string, unknown>; error?: string } | null } | null>(null);

  useEffect(() => {
    if (!plan || !status || !["dispatched"].includes(status.status)) return;
    const t = setInterval(async () => {
      const d = await api<{ status: string; result: { ok: boolean; data?: Record<string, unknown>; error?: string } | null }>(`/api/v1/deployments/${plan.id}`).catch(() => null);
      if (d) setStatus(d);
    }, 2000);
    return () => clearInterval(t);
  }, [plan, status]);

  if (exp.format !== "datapack") return <EmptyState title="Only datapack exports can be deployed" description="Resource packs are distributed to clients, not installed into a world." />;
  if (!servers.length) return <EmptyState icon={<Rocket className="h-6 w-6" />} title="No servers you can deploy to" description="Deploying requires the server administrator role on a connected server." action={<Link href="/servers" className="text-sm text-accent hover:underline">Go to ServerOS</Link>} />;

  const blocking = plan?.plan.checks.filter((c) => c.blocking && !c.ok) ?? [];
  const serverName = plan?.plan.server.name ?? "";

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="1. Choose a target" description={`Datapack r${exp.revision} for Java ${exp.target_version}.`} />
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Server">
              {(p) => (
                <Select {...p} value={serverId} disabled={!!plan} onChange={(e) => setServerId(e.target.value)}>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.environment} · {s.mc_version}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Switch label="Reload datapacks after install" checked={reloadAfter} disabled={!!plan} onChange={setReloadAfter} />
              Run <span className="font-mono text-xs">/minecraft:reload</span> after install
            </label>
            <div className="sm:col-span-2">
              {!plan ? (
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setPlan(await api<{ id: string; plan: DeploymentPlan }>("/api/v1/deployments", { body: { projectId, exportId: exp.id, serverId, reloadAfter } }));
                    } catch (e) {
                      toast.error("Could not create a plan", (e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Generate deployment plan
                </Button>
              ) : (
                !status && (
                  <Button variant="ghost" onClick={async () => { await api(`/api/v1/deployments/${plan.id}/cancel`, { body: {} }).catch(() => {}); setPlan(null); setTyped(""); }}>
                    Discard plan
                  </Button>
                )
              )}
            </div>
          </PanelBody>
        </Panel>

        {plan && (
          <Panel>
            <PanelHeader title="2. Review the plan" description="Nothing has been sent to the server yet." />
            <PanelBody className="space-y-4">
              <ul className="space-y-2">
                {plan.plan.checks.map((c) => (
                  <li key={c.name} className="flex gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : c.blocking ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                    <span>
                      <span className="font-medium">{c.name}</span> <span className="text-muted">— {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                <div className="mb-1 font-medium text-fg">Changes on {plan.plan.server.name}</div>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  <li>
                    Download the export ({formatBytes(plan.plan.export.size)}, sha256 <span className="font-mono">{plan.plan.export.sha256.slice(0, 12)}…</span>) and verify its hash.
                  </li>
                  <li>
                    Back up any existing <span className="font-mono">{plan.plan.action.path}</span>, then write the new file.
                  </li>
                  <li>{plan.plan.action.reloadAfter ? "Run /minecraft:reload to activate datapacks (players may notice a brief pause)." : "Do not reload; the pack activates on the next /minecraft:reload or restart."}</li>
                  <li>The server is never restarted.</li>
                </ul>
              </div>
            </PanelBody>
          </Panel>
        )}

        {plan && !status && (
          <Panel className={cn(plan.plan.requiresTypedConfirmation && "border-danger/40")}>
            <PanelHeader title="3. Confirm" description={plan.plan.requiresTypedConfirmation ? "This is a production server. Type its name to confirm." : "Checks are re-run when you confirm."} />
            <PanelBody className="space-y-3">
              {plan.plan.requiresTypedConfirmation && (
                <Field label={`Type "${serverName}"`}>{(p) => <Input {...p} className="font-mono" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>
              )}
              <Button
                variant={plan.plan.requiresTypedConfirmation ? "danger" : "primary"}
                disabled={blocking.length > 0 || (plan.plan.requiresTypedConfirmation && typed !== serverName)}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/v1/deployments/${plan.id}/confirm`, { body: { confirmText: typed || undefined } });
                    setStatus({ status: "dispatched", result: null });
                  } catch (e) {
                    toast.error("Deployment not started", (e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Rocket className="h-4 w-4" /> Deploy to {serverName}
              </Button>
              {blocking.length > 0 && <p className="text-xs text-danger">Resolve the failing checks above, then generate a new plan.</p>}
            </PanelBody>
          </Panel>
        )}

        {status && (
          <Panel>
            <PanelHeader title="Deployment status" />
            <PanelBody className="space-y-2 text-sm">
              {status.status === "dispatched" && (
                <p className="flex items-center gap-2 text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Sent to the agent; waiting for its result…
                </p>
              )}
              {status.status === "succeeded" && (
                <>
                  <p className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-4 w-4" /> Deployed and verified by the agent.
                  </p>
                  <pre className="sx-scroll overflow-x-auto rounded-md bg-bg p-3 font-mono text-xs text-muted">{JSON.stringify(status.result?.data, null, 2)}</pre>
                </>
              )}
              {status.status === "failed" && (
                <p className="flex items-center gap-2 text-danger">
                  <XCircle className="h-4 w-4" /> {status.result?.error ?? "The agent reported a failure."}
                </p>
              )}
              <Link href={`/servers/${plan?.plan.server.id}/deployments`} className="text-xs text-accent hover:underline">
                View server deployment history
              </Link>
            </PanelBody>
          </Panel>
        )}
      </div>
      <div className="space-y-3 text-xs text-muted">
        <Badge tone="info">Datapack · r{exp.revision}</Badge>
        <p>Deployments install a vanilla datapack into the world&apos;s datapacks folder through the server&apos;s SythiX agent. Abilities and set bonuses in this project are not part of the datapack and require the planned SythiX Runtime plugin.</p>
        <p>Deploying needs two permissions: a project role that can request deployments, and the server administrator role on the target server.</p>
      </div>
    </div>
  );
}
