"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export function HistoryPanel({ projectId, revisions, current, canEdit }: { projectId: string; revisions: { revision: number; message: string; created_at: number; author: string }[]; current: number; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Panel>
        <PanelHeader title="Revisions" description="Immutable snapshots of items, abilities, sets and asset references. Exports are pinned to a revision." />
        {revisions.length === 0 ? (
          <PanelBody>
            <EmptyState icon={<GitCommitHorizontal className="h-6 w-6" />} title="No revisions yet" description="Save a revision, or export — exports create one automatically when content changed." />
          </PanelBody>
        ) : (
          <ol className="divide-y divide-border">
            {revisions.map((r) => (
              <li key={r.revision} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-10 font-mono text-xs text-accent">r{r.revision}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{r.message || "—"}</div>
                  <div className="text-[11px] text-faint">
                    @{r.author} · {formatDateTime(r.created_at)}
                  </div>
                </div>
                {r.revision === current && <Badge tone="accent">Current</Badge>}
                {canEdit && r.revision !== current && (
                  <Button size="sm" variant="ghost" onClick={() => setRestoring(r.revision)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>
      {canEdit && (
        <Panel className="h-fit">
          <PanelHeader title="Save a revision" />
          <PanelBody className="space-y-3">
            <Input aria-label="Revision message" placeholder="What changed?" maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} />
            <Button
              variant="primary"
              loading={busy}
              className="w-full justify-center"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ revision: number }>(`/api/v1/forge/projects/${projectId}/revisions`, { body: { message } });
                  toast.success(r.revision === current ? "No changes since the last revision" : `Saved revision ${r.revision}`);
                  setMessage("");
                  router.refresh();
                } catch (e) {
                  toast.error("Not saved", (e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save revision
            </Button>
          </PanelBody>
        </Panel>
      )}
      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Restore revision ${restoring}?`}
        description="Current items, abilities and sets are replaced by that revision's content. A new revision is recorded, so this can itself be undone."
        confirmLabel="Restore"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            const r = await api<{ revision: number }>(`/api/v1/forge/projects/${projectId}/revisions/${restoring}`, { body: {} });
            toast.success(`Restored as revision ${r.revision}`);
            setRestoring(null);
            router.refresh();
          } catch (e) {
            toast.error("Restore failed", (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
