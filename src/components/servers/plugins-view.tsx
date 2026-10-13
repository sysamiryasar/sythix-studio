"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, FileCode, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { useServerCommand } from "./use-command";

interface Plugin {
  name: string;
  version: string;
  file_name: string;
  api_version: string | null;
  description: string | null;
  authors: string | null;
  reported_at: number;
}

/** Warns when a plugin declares an api-version newer than the server's Minecraft version. */
function compatWarning(p: Plugin, mc: string): string | null {
  if (!p.api_version) return "No api-version declared (legacy plugin); may run in compatibility mode.";
  const [pa = 0, pb = 0] = p.api_version.split(".").map(Number);
  const [ma = 0, mb = 0] = mc.split(".").map(Number);
  if (pa > ma || (pa === ma && pb > mb)) return `Built for API ${p.api_version}, newer than this server (${mc}).`;
  return null;
}

export function PluginsView({ serverId, plugins, online, mcVersion, canRead, canWrite, canScan }: { serverId: string; plugins: Plugin[]; online: boolean; mcVersion: string; canRead: boolean; canWrite: boolean; canScan: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useServerCommand(serverId);
  const [plugin, setPlugin] = useState(plugins[0]?.name ?? "");
  const [file, setFile] = useState("config.yml");
  const [doc, setDoc] = useState<{ content: string; sha256: string; original: string } | null>(null);
  const [backups, setBackups] = useState<{ backupId: string; size: number }[] | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const load = async () => {
    const r = await run<{ content: string; sha256: string }>("config", { action: "read", plugin, file });
    if (r.status !== "succeeded") return toast.error("Could not open file", r.error);
    setDoc({ content: r.data!.content, sha256: r.data!.sha256, original: r.data!.content });
    const b = await run<{ backups: { backupId: string; size: number }[] }>("config", { action: "backups", plugin, file });
    setBackups(b.status === "succeeded" ? b.data!.backups : []);
  };

  const changedLines = doc ? doc.content.split("\n").filter((l, i) => l !== doc.original.split("\n")[i]).length : 0;

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title={`Installed plugins (${plugins.length})`}
          description={plugins[0] ? <>Inventory reported <RelativeTime ts={plugins[0].reported_at} />.</> : "No inventory reported yet."}
          actions={
            canScan && (
              <Button
                size="sm"
                variant="outline"
                disabled={!online}
                loading={pending && !doc}
                onClick={async () => {
                  const r = await run("plugins", {});
                  if (r.status === "succeeded") {
                    toast.success("Plugin inventory updated");
                    router.refresh();
                  } else toast.error("Scan failed", r.error);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Rescan
              </Button>
            )
          }
        />
        {plugins.length === 0 ? (
          <PanelBody>
            <EmptyState title="No plugins reported" description={online ? "Run a rescan to read the plugins folder." : "Connect the agent to read the plugins folder."} />
          </PanelBody>
        ) : (
          <div className="sx-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">Plugin</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">API</th>
                  <th className="px-4 py-2 font-medium">Compatibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plugins.map((p) => {
                  const w = compatWarning(p, mcVersion);
                  return (
                    <tr key={p.name}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-faint">{p.file_name}{p.authors ? ` · ${p.authors}` : ""}</div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{p.version}</td>
                      <td className="px-4 py-2 font-mono text-xs">{p.api_version ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{w ? <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {w}</span> : <Badge tone="success">OK</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canRead && (
        <Panel>
          <PanelHeader
            title="Configuration editor"
            description={canWrite ? "The agent backs up every file before writing and refuses edits if the file changed since you opened it. Servers are never restarted automatically." : "Read-only: config writes are disabled by your role, the agent's local config or a platform flag."}
          />
          <PanelBody className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Plugin folder" className="w-56">
                {(p) => (
                  <Select {...p} value={plugin} onChange={(e) => { setPlugin(e.target.value); setDoc(null); }}>
                    {plugins.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="File" className="w-56">{(p) => <Input {...p} className="font-mono" value={file} onChange={(e) => { setFile(e.target.value); setDoc(null); }} />}</Field>
              <Button variant="outline" onClick={load} loading={pending && !doc} disabled={!online || !plugin}>
                <FileCode className="h-3.5 w-3.5" /> Open
              </Button>
            </div>
            {doc && (
              <>
                <Textarea aria-label={`${plugin}/${file}`} className="min-h-80 font-mono text-xs" spellCheck={false} readOnly={!canWrite} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} />
                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && (
                    <Button variant="primary" disabled={doc.content === doc.original || !online} onClick={() => setConfirmSave(true)}>
                      Save ({changedLines} line{changedLines === 1 ? "" : "s"} changed)
                    </Button>
                  )}
                  <span className="font-mono text-[11px] text-faint">sha256 {doc.sha256.slice(0, 16)}…</span>
                </div>
                {backups && backups.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-2 text-xs font-medium text-muted">Backups (newest first)</div>
                    <ul className="space-y-1 text-xs">
                      {backups.map((b) => (
                        <li key={b.backupId} className="flex items-center justify-between">
                          <span className="font-mono">{b.backupId}</span>
                          {canWrite && <Button size="sm" variant="ghost" onClick={() => setRestoreId(b.backupId)}>Restore</Button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </PanelBody>
        </Panel>
      )}
      <ConfirmDialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title={`Write ${plugin}/${file}?`}
        description="The current file is backed up first. Most plugins need their own reload command or a server restart to pick up changes — SythiX will not do that for you."
        confirmLabel="Back up and save"
        loading={pending}
        onConfirm={async () => {
          if (!doc) return;
          const r = await run<{ backupId: string; sha256: string }>("config", { action: "write", plugin, file, content: doc.content, expectedSha256: doc.sha256 });
          setConfirmSave(false);
          if (r.status === "succeeded") {
            toast.success("Saved", `Backup ${r.data!.backupId}`);
            await load();
          } else toast.error("Not saved", r.error);
        }}
      />
      <ConfirmDialog
        open={!!restoreId}
        onClose={() => setRestoreId(null)}
        title={`Restore backup ${restoreId}?`}
        description="The current version is backed up before it's replaced."
        confirmLabel="Restore"
        loading={pending}
        onConfirm={async () => {
          const r = await run("config", { action: "restore", plugin, file, backupId: restoreId });
          setRestoreId(null);
          if (r.status === "succeeded") {
            toast.success("Restored");
            await load();
          } else toast.error("Restore failed", r.error);
        }}
      />
    </div>
  );
}
