"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useState } from "react";
import { Hammer, IdCard, Package, Rocket, Server, Shield, Sparkles, Star, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { Stat } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { AchievementView } from "@/modules/nexusid/achievements";

const ICONS: Record<string, LucideIcon> = { sparkles: Sparkles, "id-card": IdCard, users: Users, shield: Shield, hammer: Hammer, package: Package, server: Server, rocket: Rocket };

export function AchievementsBoard({ items }: { items: AchievementView[] }) {
  const toast = useToast();
  const [showcase, setShowcase] = useState(new Set(items.filter((i) => i.showcased).map((i) => i.id)));
  const earned = items.filter((i) => i.awarded_at);
  const points = earned.reduce((s, i) => s + i.points, 0);

  const toggle = async (id: string) => {
    const next = new Set(showcase);
    if (next.has(id)) next.delete(id);
    else if (next.size >= 6) return toast.info("Showcase full", "You can feature up to six achievements.");
    else next.add(id);
    setShowcase(next);
    try {
      await api("/api/v1/nexus/achievements/showcase", { method: "PUT", body: { ids: [...next] } });
    } catch (e) {
      toast.error("Showcase not saved", (e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Unlocked" value={`${earned.length} / ${items.length}`} />
        <Stat label="Points" value={points} />
        <Stat label="Showcased" value={`${showcase.size} / 6`} hint="Shown first on your public profile" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => {
          const Icon = ICONS[a.icon] ?? Star;
          const got = !!a.awarded_at;
          return (
            <div key={a.id} className={cn("rounded-lg border p-4", got ? "border-border bg-surface" : "border-dashed border-border bg-transparent opacity-60")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-md", got ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted">{a.description}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
                    <span>
                      {a.points} pts · {got ? <>unlocked <RelativeTime ts={a.awarded_at} /></> : "locked"}
                    </span>
                    {got && (
                      <button className={cn("hover:underline", showcase.has(a.id) ? "text-accent" : "text-muted")} onClick={() => toggle(a.id)} aria-pressed={showcase.has(a.id)}>
                        {showcase.has(a.id) ? "Showcased" : "Showcase"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-faint">Achievements are awarded automatically from real activity across NexusID, ForgeOS and ServerOS.</p>
    </div>
  );
}
