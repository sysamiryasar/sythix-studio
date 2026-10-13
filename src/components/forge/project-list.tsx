"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Archive, Copy, Folder, Hammer, Plus, RotateCcw } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  namespace: string;
  target_version: string;
  folder: string;
  visibility: string;
  current_revision: number;
  item_count: number;
  updated_at: number;
  archived_at: number | null;
}

export function ProjectList(props: {
  workspaceName: string;
  projects: ProjectSummary[];
  canCreate: boolean;
  canDelete: boolean;
  targets: { id: string; label: string }[];
  defaultTarget: string;
  openNew: boolean;
  showArchived: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(props.openNew && props.canCreate);
  const [form, setForm] = useState({ name: "", description: "", targetVersion: props.defaultTarget, folder: "", namespace: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<ProjectSummary | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, ProjectSummary[]>();
    for (const p of props.projects) m.set(p.folder, [...(m.get(p.folder) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [props.projects]);
  const folders = groups.map(([f]) => f).filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="ForgeOS"
        title="Projects"
        description={`Custom items, abilities and equipment for ${props.workspaceName}. Exports are validated against the selected Minecraft version.`}
        actions={
          <>
            <ButtonLink href={props.showArchived ? "/forge" : "/forge?archived=1"} variant="ghost" size="sm">
              {props.showArchived ? "Hide archived" : "Show archived"}
            </ButtonLink>
            {props.canCreate && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> New project
              </Button>
            )}
          </>
        }
      />
      {props.projects.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-6 w-6" />}
          title="No projects yet"
          description="Create a project to design items, attach abilities, upload textures and export datapacks."
          action={props.canCreate && <Button variant="primary" onClick={() => setOpen(true)}>Create your first project</Button>}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([folder, list]) => (
            <section key={folder || "_root"}>
              {folder && (
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
                  <Folder className="h-3.5 w-3.5" /> {folder}
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((p) => (
                  <div key={p.id} className="group relative rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                    <Link href={`/forge/${p.id}`} className="absolute inset-0" aria-label={`Open ${p.name}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="font-mono text-[11px] text-faint">{p.namespace}</div>
                      </div>
                      <Badge tone="info">Java {p.target_version}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-8 text-xs text-muted">{p.description || "No description."}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
                      <span>
                        {p.item_count} item{p.item_count === 1 ? "" : "s"} · r{p.current_revision} · {formatRelative(p.updated_at)}
                      </span>
                      <span className="relative z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {props.canCreate && (
                          <button
                            aria-label="Duplicate"
                            title="Duplicate"
                            className="rounded p-1 hover:bg-surface-2 hover:text-fg"
                            onClick={async () => {
                              setBusy(p.id);
                              try {
                                const c = await api<{ id: string }>(`/api/v1/forge/projects/${p.id}/duplicate`, { body: {} });
                                toast.success("Project duplicated");
                                router.push(`/forge/${c.id}`);
                              } catch (e) {
                                toast.error("Duplicate failed", (e as Error).message);
                              } finally {
                                setBusy(null);
                              }
                            }}
                            disabled={busy === p.id}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {props.canDelete &&
                          (p.archived_at ? (
                            <button aria-label="Restore" title="Restore" className="rounded p-1 hover:bg-surface-2 hover:text-fg" onClick={() => api(`/api/v1/forge/projects/${p.id}`, { method: "PATCH", body: { archived: false } }).then(() => router.refresh())}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button aria-label="Archive" title="Archive" className="rounded p-1 hover:bg-surface-2 hover:text-fg" onClick={() => setArchiving(p)}>
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          ))}
                      </span>
                    </div>
                    {p.archived_at && <Badge className="mt-2">Archived</Badge>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New ForgeOS project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy === "create"}
              disabled={!form.name.trim()}
              onClick={async () => {
                setBusy("create");
                try {
                  const p = await api<{ id: string }>("/api/v1/forge/projects", { body: { ...form, namespace: form.namespace || undefined } });
                  router.push(`/forge/${p.id}`);
                } catch (e) {
                  toast.error("Project not created", (e as Error).message);
                  setBusy(null);
                }
              }}
            >
              Create project
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">{(p) => <Input {...p} autoFocus maxLength={64} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Minecraft version" hint="Java Edition. Determines every generated format.">
            {(p) => (
              <Select {...p} value={form.targetVersion} onChange={(e) => setForm({ ...form, targetVersion: e.target.value })}>
                {props.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Namespace" hint="Optional. Defaults to a name-based id.">
            {(p) => <Input {...p} className="font-mono" placeholder="my_pack" maxLength={24} value={form.namespace} onChange={(e) => setForm({ ...form, namespace: e.target.value.toLowerCase() })} />}
          </Field>
          <Field label="Folder" hint="Optional, e.g. Weapons/Season 1" className="sm:col-span-2">
            {(p) => (
              <>
                <Input {...p} list="sx-folders" maxLength={80} value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} />
                <datalist id="sx-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name}?`}
        description="Archived projects are hidden from the list but keep all items, assets, revisions and exports. You can restore them later."
        confirmLabel="Archive"
        loading={busy === "archive"}
        onConfirm={async () => {
          if (!archiving) return;
          setBusy("archive");
          try {
            await api(`/api/v1/forge/projects/${archiving.id}`, { method: "PATCH", body: { archived: true } });
            setArchiving(null);
            router.refresh();
          } catch (e) {
            toast.error("Archive failed", (e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}
