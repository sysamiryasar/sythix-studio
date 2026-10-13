"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, Package, Rocket, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type { ValidationReport } from "@/modules/forgeos/validate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface ExportRow {
  id: string;
  revision: number;
  format: string;
  target_version: string;
  status: string;
  size_bytes: number | null;
  sha256: string | null;
  created_at: number;
  author: string;
}

export function ExportPanel({ projectId, report, formats, exports, canExport, canDeploy }: { projectId: string; report: ValidationReport; formats: { id: string; label: string; description: string }[]; exports: ExportRow[]; canExport: boolean; canDeploy: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [lastErrors, setLastErrors] = useState<string[]>([]);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of report.issues) counts[i.severity]++;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Validation report"
            description={`Checked against Minecraft Java ${report.target}.`}
            actions={report.ok ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Exportable</Badge> : <Badge tone="danger"><XCircle className="h-3 w-3" /> {counts.error} blocking</Badge>}
          />
          <PanelBody className="space-y-1.5">
            {report.issues.length === 0 && <p className="text-sm text-success">No issues found.</p>}
            {report.issues.map((i, k) => (
              <div key={k} className={cn("flex gap-2 rounded-md px-2 py-1.5 text-xs", i.severity === "error" ? "bg-danger/10 text-danger" : i.severity === "warning" ? "bg-warning/10 text-warning" : "text-muted")}>
                {i.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  <span className="font-mono opacity-80">{i.entity}</span> — {i.message}
                  {i.formats?.length ? <span className="opacity-70"> (blocks {i.formats.join(", ")})</span> : null}
                </span>
              </div>
            ))}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="What each output implements" description="Honest capability report for this project." />
          <PanelBody className="grid gap-4 text-xs sm:grid-cols-3">
            {(
              [
                ["Datapack (vanilla)", report.support.datapack, "success"],
                ["Resource pack (vanilla)", report.support.resourcepack, "info"],
                ["Runtime only (planned plugin)", report.support.runtimeOnly, "warning"],
              ] as const
            ).map(([title, list, tone]) => (
              <div key={title}>
                <Badge tone={tone}>{title}</Badge>
                <ul className="mt-2 space-y-1 text-muted">
                  {list.length ? list.map((s, k) => <li key={k}>{s}</li>) : <li className="text-faint">Nothing</li>}
                </ul>
              </div>
            ))}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Export history" />
          {exports.length === 0 ? (
            <PanelBody className="text-sm text-muted">No exports yet.</PanelBody>
          ) : (
            <ul className="divide-y divide-border">
              {exports.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <Package className="h-4 w-4 text-faint" />
                  <div className="min-w-0 flex-1">
                    <div>
                      {e.format} · r{e.revision} · Java {e.target_version}
                    </div>
                    <div className="text-[11px] text-faint">
                      @{e.author} · <RelativeTime ts={e.created_at} /> {e.size_bytes ? `· ${formatBytes(e.size_bytes)}` : ""} {e.sha256 ? <span className="font-mono">· sha256 {e.sha256.slice(0, 12)}…</span> : null}
                    </div>
                  </div>
                  {e.status === "succeeded" ? (
                    <>
                      <a href={`/api/v1/forge/projects/${projectId}/exports/${e.id}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                      {canDeploy && e.format === "datapack" && (
                        <Link href={`/forge/${projectId}/exports/${e.id}/deploy`} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">
                          <Rocket className="h-3.5 w-3.5" /> Deploy
                        </Link>
                      )}
                    </>
                  ) : (
                    <Badge tone="danger">Failed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="space-y-3 xl:sticky xl:top-16 xl:h-fit">
        {formats.map((f) => (
          <Panel key={f.id}>
            <PanelBody>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <p className="mt-0.5 text-xs text-muted">{f.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={f.id === "bundle" ? "primary" : "secondary"}
                  disabled={!canExport}
                  loading={running === f.id}
                  onClick={async () => {
                    setRunning(f.id);
                    setLastErrors([]);
                    try {
                      const r = await api<{ status: string; errors: string[]; revision: number; id: string }>(`/api/v1/forge/projects/${projectId}/exports`, { body: { format: f.id } });
                      if (r.status === "succeeded") {
                        toast.success(`${f.label} ready`, `Revision ${r.revision}, validated and verified.`);
                        window.location.href = `/api/v1/forge/projects/${projectId}/exports/${r.id}`;
                      } else {
                        setLastErrors(r.errors);
                        toast.error(`${f.label} failed validation`, r.errors[0]);
                      }
                      router.refresh();
                    } catch (e) {
                      toast.error("Export failed", (e as Error).message);
                    } finally {
                      setRunning(null);
                    }
                  }}
                >
                  Export
                </Button>
              </div>
            </PanelBody>
          </Panel>
        ))}
        {lastErrors.length > 0 && (
          <Panel className="border-danger/40">
            <PanelHeader title="Last export was blocked" />
            <PanelBody className="space-y-1 text-xs text-danger">
              {lastErrors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </PanelBody>
          </Panel>
        )}
        <p className="px-1 text-[11px] text-faint">Exports are deterministic: the same revision always produces byte-identical archives. Each archive includes a manifest with SHA-256 hashes and the validation report.</p>
      </div>
    </div>
  );
}
