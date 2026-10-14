"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Shield, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { ATTRIBUTES, EFFECTS } from "@/modules/forgeos/catalog";
import type { SetRecord } from "@/modules/forgeos/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

type Effect = { type: "potion"; effect: string; amplifier: number } | { type: "attribute"; attribute: string; amount: number } | { type: "ability"; abilityId: string };
type Condition =
  | { type: "health_below"; percent: number }
  | { type: "sneaking" }
  | { type: "in_water" }
  | { type: "time_of_day"; value: "day" | "night" }
  | { type: "cooldown_ready"; abilityId: string }
  | { type: "full_set_equipped" };
interface Bonus {
  piecesRequired: number;
  effects: Effect[];
  conditions: Condition[];
}
interface Draft {
  id?: string;
  identifier: string;
  name: string;
  pieces: string[];
  bonuses: Bonus[];
}

const CONDITION_LABELS: Record<Condition["type"], string> = {
  health_below: "Health below %",
  sneaking: "While sneaking",
  in_water: "While in water",
  time_of_day: "Time of day",
  cooldown_ready: "Ability cooldown ready",
  full_set_equipped: "Full set equipped",
};

export function SetsEditor({ projectId, sets, armor, abilities, canEdit }: { projectId: string; sets: SetRecord[]; armor: { identifier: string; name: string; slot: string }[]; abilities: { identifier: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SetRecord | null>(null);
  const updBonus = (i: number, patch: Partial<Bonus>) => draft && setDraft({ ...draft, bonuses: draft.bonuses.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const newCondition = (t: Condition["type"]): Condition =>
    t === "health_below" ? { type: t, percent: 30 } : t === "time_of_day" ? { type: t, value: "night" } : t === "cooldown_ready" ? { type: t, abilityId: abilities[0]?.identifier ?? "" } : ({ type: t } as Condition);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
        Set bonuses and their conditions aren&apos;t possible with vanilla data components. They&apos;re validated here and exported to <span className="font-mono">sythix-runtime.json</span> (planned SythiX Runtime). Each piece&apos;s own attributes still work in vanilla.
      </div>
      <div className="flex justify-end">
        {canEdit && (
          <Button variant="primary" disabled={armor.length < 2} title={armor.length < 2 ? "Create at least two armor items first" : undefined} onClick={() => setDraft({ identifier: "", name: "", pieces: [], bonuses: [{ piecesRequired: 2, effects: [{ type: "potion", effect: "speed", amplifier: 0 }], conditions: [] }] })}>
            <Plus className="h-4 w-4" /> New set
          </Button>
        )}
      </div>
      {sets.length === 0 ? (
        <EmptyState icon={<Shield className="h-6 w-6" />} title="No equipment sets" description={armor.length < 2 ? "Create at least two armor items, then group them into a set." : "Group armor pieces and define bonuses."} />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {sets.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Shield className="h-4 w-4 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="font-mono text-[11px] text-faint">
                    {s.data.pieces.join(", ")} · {s.data.bonuses.length} bonus{s.data.bonuses.length === 1 ? "" : "es"}
                  </div>
                </div>
                {canEdit && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: s.id, identifier: s.identifier, name: s.name, pieces: s.data.pieces, bonuses: s.data.bonuses as unknown as Bonus[] })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
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
        title={draft?.id ? "Edit equipment set" : "New equipment set"}
        size="lg"
        footer={
          <>
            <Badge tone="warning">Requires SythiX Runtime (planned)</Badge>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!draft || draft.pieces.length < 2 || !draft.name.trim() || draft.identifier.length < 2}
              onClick={async () => {
                if (!draft) return;
                setSaving(true);
                const body = { identifier: draft.identifier, name: draft.name, data: { pieces: draft.pieces, bonuses: draft.bonuses } };
                try {
                  if (draft.id) await api(`/api/v1/forge/projects/${projectId}/sets/${draft.id}`, { method: "PUT", body });
                  else await api(`/api/v1/forge/projects/${projectId}/sets`, { body });
                  toast.success("Set saved");
                  setDraft(null);
                  router.refresh();
                } catch (e) {
                  toast.error("Set not saved", (e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save set
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{(p) => <Input {...p} maxLength={64} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
              <Field label="Identifier">{(p) => <Input {...p} className="font-mono" maxLength={40} value={draft.identifier} onChange={(e) => setDraft({ ...draft, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />}</Field>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Pieces (2–4, one per slot)</div>
              <div className="flex flex-wrap gap-2">
                {armor.map((a) => {
                  const on = draft.pieces.includes(a.identifier);
                  return (
                    <button key={a.identifier} type="button" aria-pressed={on} disabled={!on && draft.pieces.length >= 4} onClick={() => setDraft({ ...draft, pieces: on ? draft.pieces.filter((p) => p !== a.identifier) : [...draft.pieces, a.identifier] })} className={cn("rounded-md border px-2.5 py-1 text-xs", on ? "border-accent bg-accent-soft" : "border-border text-muted hover:text-fg")}>
                      {a.name} <span className="text-faint">· {a.slot}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {draft.bonuses.map((b, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-sm font-medium">Bonus {i + 1}</span>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Pieces required
                    <Input type="number" min={1} max={4} className="h-7 w-16" value={b.piecesRequired} onChange={(e) => updBonus(i, { piecesRequired: Number(e.target.value) })} />
                  </label>
                  <span className="flex-1" />
                  {draft.bonuses.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove bonus" onClick={() => setDraft({ ...draft, bonuses: draft.bonuses.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></Button>}
                </div>
                <div className="space-y-2">
                  {b.effects.map((ef, k) => {
                    const setEf = (n: Effect) => updBonus(i, { effects: b.effects.map((x, j) => (j === k ? n : x)) });
                    return (
                      <div key={k} className="grid grid-cols-[120px_1fr_90px_auto] gap-2">
                        <Select aria-label="Effect type" value={ef.type} onChange={(e) => setEf(e.target.value === "potion" ? { type: "potion", effect: "speed", amplifier: 0 } : e.target.value === "attribute" ? { type: "attribute", attribute: "armor", amount: 2 } : { type: "ability", abilityId: abilities[0]?.identifier ?? "" })}>
                          <option value="potion">Potion</option>
                          <option value="attribute">Attribute</option>
                          <option value="ability" disabled={!abilities.length}>Ability</option>
                        </Select>
                        {ef.type === "potion" && (
                          <>
                            <Select aria-label="Potion" value={ef.effect} onChange={(e) => setEf({ ...ef, effect: e.target.value })}>{EFFECTS.map((x) => <option key={x}>{x}</option>)}</Select>
                            <Input aria-label="Amplifier" type="number" min={0} max={4} value={ef.amplifier} onChange={(e) => setEf({ ...ef, amplifier: Number(e.target.value) })} />
                          </>
                        )}
                        {ef.type === "attribute" && (
                          <>
                            <Select aria-label="Attribute" value={ef.attribute} onChange={(e) => setEf({ ...ef, attribute: e.target.value })}>{ATTRIBUTES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
                            <Input aria-label="Amount" type="number" step={0.1} value={ef.amount} onChange={(e) => setEf({ ...ef, amount: Number(e.target.value) })} />
                          </>
                        )}
                        {ef.type === "ability" && (
                          <>
                            <Select aria-label="Ability" value={ef.abilityId} onChange={(e) => setEf({ ...ef, abilityId: e.target.value })}>{abilities.map((x) => <option key={x.identifier} value={x.identifier}>{x.name}</option>)}</Select>
                            <span />
                          </>
                        )}
                        <Button size="icon" variant="ghost" aria-label="Remove effect" disabled={b.effects.length <= 1} onClick={() => updBonus(i, { effects: b.effects.filter((_, j) => j !== k) })}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="ghost" disabled={b.effects.length >= 6} onClick={() => updBonus(i, { effects: [...b.effects, { type: "potion", effect: "resistance", amplifier: 0 }] })}><Plus className="h-3.5 w-3.5" /> Effect</Button>
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-1.5 text-xs text-muted">Conditions (all must hold)</div>
                  <div className="space-y-2">
                    {b.conditions.map((c, k) => {
                      const setC = (n: Condition) => updBonus(i, { conditions: b.conditions.map((x, j) => (j === k ? n : x)) });
                      return (
                        <div key={k} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <Select aria-label="Condition" value={c.type} onChange={(e) => setC(newCondition(e.target.value as Condition["type"]))}>
                            {(Object.keys(CONDITION_LABELS) as Condition["type"][]).map((t) => <option key={t} value={t} disabled={t === "cooldown_ready" && !abilities.length}>{CONDITION_LABELS[t]}</option>)}
                          </Select>
                          {c.type === "health_below" ? <Input aria-label="Percent" type="number" min={1} max={99} value={c.percent} onChange={(e) => setC({ ...c, percent: Number(e.target.value) })} />
                            : c.type === "time_of_day" ? <Select aria-label="Time" value={c.value} onChange={(e) => setC({ ...c, value: e.target.value as "day" | "night" })}><option value="day">Day</option><option value="night">Night</option></Select>
                            : c.type === "cooldown_ready" ? <Select aria-label="Ability" value={c.abilityId} onChange={(e) => setC({ ...c, abilityId: e.target.value })}>{abilities.map((x) => <option key={x.identifier} value={x.identifier}>{x.name}</option>)}</Select>
                            : <span />}
                          <Button size="icon" variant="ghost" aria-label="Remove condition" onClick={() => updBonus(i, { conditions: b.conditions.filter((_, j) => j !== k) })}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      );
                    })}
                    <Button size="sm" variant="ghost" disabled={b.conditions.length >= 4} onClick={() => updBonus(i, { conditions: [...b.conditions, newCondition("sneaking")] })}><Plus className="h-3.5 w-3.5" /> Condition</Button>
                  </div>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" disabled={draft.bonuses.length >= 4} onClick={() => setDraft({ ...draft, bonuses: [...draft.bonuses, { piecesRequired: Math.min(4, draft.pieces.length || 2), effects: [{ type: "potion", effect: "strength", amplifier: 0 }], conditions: [] }] })}>
              <Plus className="h-3.5 w-3.5" /> Add bonus tier
            </Button>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            await api(`/api/v1/forge/projects/${projectId}/sets/${deleting!.id}`, { method: "DELETE" });
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
