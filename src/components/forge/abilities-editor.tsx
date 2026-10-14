"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Zap } from "lucide-react";
import { api } from "@/lib/client/api";
import type { AbilityRecord } from "@/modules/forgeos/content";
import { ABILITY_TEMPLATE_IDS, TRIGGERS, type AbilityTemplate } from "@/modules/forgeos/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { TEMPLATE_INFO, defaultParams } from "./ability-fields";

interface Draft {
  id?: string;
  identifier: string;
  name: string;
  template: AbilityTemplate;
  trigger: (typeof TRIGGERS)[number];
  cooldownTicks: number;
  permission: string;
  params: Record<string, unknown>;
}

const fresh = (): Draft => ({ identifier: "", name: "", template: "dash", trigger: "right_click", cooldownTicks: 100, permission: "", params: defaultParams("dash") });

export function AbilitiesEditor({ projectId, abilities, canEdit }: { projectId: string; abilities: AbilityRecord[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AbilityRecord | null>(null);
  const info = draft ? TEMPLATE_INFO[draft.template] : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
        Abilities require server-side logic. They are validated here and exported to <span className="font-mono">sythix-runtime.json</span> for the planned SythiX Runtime plugin. Generating this configuration does not make an ability work in-game.
      </div>
      <div className="flex justify-end">
        {canEdit && (
          <Button variant="primary" onClick={() => setDraft(fresh())}>
            <Plus className="h-4 w-4" /> New ability
          </Button>
        )}
      </div>
      {abilities.length === 0 ? (
        <EmptyState icon={<Zap className="h-6 w-6" />} title="No abilities" description="Start from a template: dash, shockwave, projectile, teleport, shield, area damage, healing, buff, lightning or summon." />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {abilities.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Zap className="h-4 w-4 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="font-mono text-[11px] text-faint">
                    {a.identifier} · {TEMPLATE_INFO[a.template]?.label ?? a.template} · {a.trigger_kind} · {(a.cooldown_ticks / 20).toFixed(1)}s cooldown
                    {a.permission ? ` · ${a.permission}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: a.id, identifier: a.identifier, name: a.name, template: a.template, trigger: a.trigger_kind as Draft["trigger"], cooldownTicks: a.cooldown_ticks, permission: a.permission ?? "", params: a.params })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                      Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit ability" : "New ability"}
        size="lg"
        footer={
          <>
            <Badge tone="warning">Requires SythiX Runtime (planned)</Badge>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!draft?.name.trim() || (draft?.identifier.length ?? 0) < 2}
              onClick={async () => {
                if (!draft) return;
                setSaving(true);
                const body = { identifier: draft.identifier, name: draft.name, template: draft.template, trigger: draft.trigger, cooldownTicks: draft.cooldownTicks, permission: draft.permission || null, params: draft.params };
                try {
                  if (draft.id) await api(`/api/v1/forge/projects/${projectId}/abilities/${draft.id}`, { method: "PUT", body });
                  else await api(`/api/v1/forge/projects/${projectId}/abilities`, { body });
                  toast.success("Ability saved");
                  setDraft(null);
                  router.refresh();
                } catch (e) {
                  toast.error("Ability not saved", (e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save ability
            </Button>
          </>
        }
      >
        {draft && info && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(p) => <Input {...p} maxLength={64} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
            <Field label="Identifier">{(p) => <Input {...p} className="font-mono" maxLength={40} value={draft.identifier} onChange={(e) => setDraft({ ...draft, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />}</Field>
            <Field label="Template" hint={info.description}>
              {(p) => (
                <Select {...p} value={draft.template} onChange={(e) => setDraft({ ...draft, template: e.target.value as AbilityTemplate, params: defaultParams(e.target.value as AbilityTemplate) })}>
                  {ABILITY_TEMPLATE_IDS.map((t) => (
                    <option key={t} value={t}>
                      {TEMPLATE_INFO[t].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Trigger">
              {(p) => (
                <Select {...p} value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as Draft["trigger"] })}>
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Cooldown (ticks)" hint={`${(draft.cooldownTicks / 20).toFixed(1)} seconds`}>
              {(p) => <Input {...p} type="number" min={0} max={72000} value={draft.cooldownTicks} onChange={(e) => setDraft({ ...draft, cooldownTicks: Number(e.target.value) })} />}
            </Field>
            <Field label="Permission node" hint="Optional, e.g. sythix.ability.dash">
              {(p) => <Input {...p} className="font-mono" maxLength={80} value={draft.permission} onChange={(e) => setDraft({ ...draft, permission: e.target.value.toLowerCase() })} />}
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{info.label} parameters</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {info.fields.map((f) => {
                  const v = draft.params[f.key];
                  const setP = (val: unknown) => {
                    const params = { ...draft.params };
                    if (val === undefined || val === "") delete params[f.key];
                    else params[f.key] = val;
                    setDraft({ ...draft, params });
                  };
                  if (f.type === "boolean")
                    return (
                      <label key={f.key} className="flex items-center gap-2 text-sm">
                        <Switch label={f.label} checked={Boolean(v ?? f.default)} onChange={setP} /> {f.label}
                      </label>
                    );
                  if (f.type === "select")
                    return (
                      <Field key={f.key} label={f.label}>
                        {(p) => (
                          <Select {...p} value={(v as string) ?? ""} onChange={(e) => setP(e.target.value || undefined)}>
                            {f.optional && <option value="">None</option>}
                            {f.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  return (
                    <Field key={f.key} label={f.label} hint={`${f.min} – ${f.max}`}>
                      {(p) => <Input {...p} type="number" min={f.min} max={f.max} step={f.step ?? 1} value={(v as number) ?? f.default} onChange={(e) => setP(Number(e.target.value))} />}
                    </Field>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Items and set bonuses that reference it will fail validation until updated."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            await api(`/api/v1/forge/projects/${projectId}/abilities/${deleting!.id}`, { method: "DELETE" });
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
