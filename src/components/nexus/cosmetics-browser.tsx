"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABELS, type CosmeticView, type CosmeticCategory } from "@/modules/nexusid/cosmetics";
import { CosmeticPreview } from "./cosmetic-preview";

const RARITY_TONE = { common: "neutral", uncommon: "success", rare: "info", epic: "accent", legendary: "warning" } as const;

export function CosmeticsBrowser({ items: initial }: { items: CosmeticView[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const categories = Object.keys(CATEGORY_LABELS) as CosmeticCategory[];
  const equipped = items.filter((i) => i.equipped);

  const equip = async (c: CosmeticView, on: boolean) => {
    setBusy(c.id);
    try {
      await api("/api/v1/nexus/cosmetics/loadout", { method: "PUT", body: { category: c.category, cosmeticId: on ? c.id : null } });
      setItems((xs) => xs.map((x) => (x.category === c.category ? { ...x, equipped: on && x.id === c.id ? 1 : 0 } : x)));
    } catch (e) {
      toast.error("Could not update loadout", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          All cosmetics are development placeholders rendered procedurally. They appear on SythiX profiles only and are not visible in vanilla Minecraft.
        </div>
        {categories.map((cat) => {
          const list = items.filter((i) => i.category === cat);
          if (!list.length) return null;
          return (
            <Panel key={cat}>
              <PanelHeader title={CATEGORY_LABELS[cat]} />
              <PanelBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const color = (() => {
                    try {
                      return (JSON.parse(c.preview_style) as { primary?: string }).primary ?? "#555";
                    } catch {
                      return "#555";
                    }
                  })();
                  return (
                    <div key={c.id} className={cn("rounded-lg border p-3", c.equipped ? "border-accent bg-accent-soft" : "border-border bg-surface-2", !c.owned && "opacity-70")}>
                      <div className="flex items-start gap-3">
                        <span className="h-10 w-10 shrink-0 rounded-md border border-border-strong" style={{ background: color }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {c.name} {!c.owned && <Lock className="h-3 w-3 text-faint" aria-label="Locked" />}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={RARITY_TONE[c.rarity as keyof typeof RARITY_TONE] ?? "neutral"}>{c.rarity}</Badge>
                            {c.is_placeholder === 1 && <DataSourceBadge source="placeholder" />}
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted">{c.description}</p>
                      <div className="mt-3">
                        {c.owned ? (
                          <Button size="sm" variant={c.equipped ? "outline" : "secondary"} loading={busy === c.id} onClick={() => equip(c, !c.equipped)}>
                            {c.equipped ? "Unequip" : "Equip"}
                          </Button>
                        ) : (
                          <p className="text-[11px] text-faint">
                            {c.unlock === "achievement" ? `Unlock: earn “${c.unlock_achievement_name}”` : "Not yet obtainable"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </PanelBody>
            </Panel>
          );
        })}
      </div>
      <Panel className="h-fit xl:sticky xl:top-16">
        <PanelHeader title="Loadout preview" description="Website preview only." />
        <PanelBody className="sx-voxel-grid flex justify-center">
          <CosmeticPreview loadout={equipped} />
        </PanelBody>
      </Panel>
    </div>
  );
}
