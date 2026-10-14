"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Box, ImageIcon, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ModelViewer } from "./model-viewer";

interface AssetView {
  id: string;
  kind: "texture" | "model";
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  usedBy: string[];
  model: object | null;
  textureRefs: string[];
}

export function AssetsManager({ projectId, assets, canEdit }: { projectId: string; assets: AssetView[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"texture" | "model">("texture");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<AssetView | null>(null);
  const [deleting, setDeleting] = useState<AssetView | null>(null);
  const textures = assets.filter((a) => a.kind === "texture");
  const url = (id: string) => `/api/v1/forge/projects/${projectId}/assets/${id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {assets.length === 0 && <EmptyState icon={<ImageIcon className="h-6 w-6" />} title="No assets yet" description="Upload 16×16 to 512×512 PNG textures or Java Edition JSON models." />}
        {(["texture", "model"] as const).map((k) => {
          const list = assets.filter((a) => a.kind === k);
          if (!list.length) return null;
          return (
            <Panel key={k}>
              <PanelHeader title={k === "texture" ? "Textures" : "Models"} />
              <PanelBody className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((a) => {
                  const missing = a.textureRefs.filter((r) => !textures.some((t) => t.name === r));
                  return (
                    <div key={a.id} className="group rounded-lg border border-border bg-surface-2 p-2">
                      <button className="sx-voxel-grid flex aspect-square w-full items-center justify-center rounded-md bg-bg" onClick={() => setViewing(a)} aria-label={`Preview ${a.name}`}>
                        {k === "texture" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url(a.id)} alt={a.name} className="pixelated h-3/4 w-3/4 object-contain" />
                        ) : (
                          <Box className="h-8 w-8 text-accent" />
                        )}
                      </button>
                      <div className="mt-2 flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs">{a.name}</div>
                          <div className="text-[10px] text-faint">
                            {a.width ? `${a.width}×${a.height} · ` : ""}
                            {formatBytes(a.size)}
                          </div>
                        </div>
                        {canEdit && (
                          <button aria-label={`Delete ${a.name}`} className="rounded p-1 text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" onClick={() => setDeleting(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.usedBy.length ? <Badge>{a.usedBy.length} item{a.usedBy.length > 1 ? "s" : ""}</Badge> : <Badge tone="neutral">Unused</Badge>}
                        {missing.length > 0 && <Badge tone="danger" title={`Missing: ${missing.join(", ")}`}>Missing textures</Badge>}
                      </div>
                    </div>
                  );
                })}
              </PanelBody>
            </Panel>
          );
        })}
      </div>
      {canEdit && (
        <Panel className="h-fit">
          <PanelHeader title="Upload" description="Files are validated from their bytes on the server." />
          <PanelBody>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!file) return;
                setBusy(true);
                const fd = new FormData();
                fd.set("kind", kind);
                fd.set("name", name);
                fd.set("file", file);
                try {
                  const res = await fetch(`/api/v1/forge/projects/${projectId}/assets`, { method: "POST", body: fd, credentials: "same-origin" });
                  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
                  if (!res.ok) throw new Error(j.error?.message ?? "Upload failed");
                  toast.success(`Uploaded ${name}`);
                  setName("");
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                  router.refresh();
                } catch (err) {
                  toast.error("Upload rejected", (err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Type">
                {(p) => (
                  <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as "texture" | "model")}>
                    <option value="texture">Texture (PNG, square, 16–512px, ≤256 KB)</option>
                    <option value="model">Model (Java Edition JSON, ≤64 KB)</option>
                  </Select>
                )}
              </Field>
              <Field label="File">
                {(p) => (
                  <input
                    {...p}
                    ref={fileRef}
                    type="file"
                    accept={kind === "texture" ? "image/png" : "application/json,.json"}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40));
                    }}
                    className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-fg"
                  />
                )}
              </Field>
              <Field label="Name" hint="Referenced by models and used as the texture path.">
                {(p) => <Input {...p} className="font-mono" maxLength={40} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />}
              </Field>
              <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={!file || !name}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
              <p className="text-[11px] text-faint">Model texture references must name textures in this project (e.g. &quot;blade&quot;). Animated textures and block models with custom parents aren&apos;t supported yet.</p>
            </form>
          </PanelBody>
        </Panel>
      )}
      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ""} size="lg">
        {viewing && (
          <ModelViewer
            className="h-[60vh]"
            source={
              viewing.kind === "texture"
                ? { kind: "sprite", textureUrl: url(viewing.id) }
                : { kind: "model", model: viewing.model as never, textureUrls: Object.fromEntries(textures.map((t) => [t.name, url(t.id)])) }
            }
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={deleting?.usedBy.length ? `Used by ${deleting.usedBy.join(", ")}. Those items will fail validation until you choose another asset.` : "This permanently removes the file."}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            await api(`/api/v1/forge/projects/${projectId}/assets/${deleting!.id}`, { method: "DELETE" });
            setDeleting(null);
            router.refresh();
          } catch (e) {
            toast.error("Delete failed", (e as Error).message);
          }
        }}
      />
    </div>
  );
}
