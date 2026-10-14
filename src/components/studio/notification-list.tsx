"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { NotificationRow } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/panel";

const KIND_LABEL: Record<string, string> = {
  "server.disconnected": "Server",
  "server.connected": "Server",
  "deployment.result": "Deployment",
  "export.failed": "Validation",
  "friend.request": "Community",
  "friend.accepted": "Community",
  "team.invite": "Community",
  "project.changed": "Project",
  "security.event": "Security",
  "achievement.awarded": "Achievement",
  "module.update": "Module",
};

export function NotificationList({ items: initial }: { items: NotificationRow[] }) {
  const [items, setItems] = useState(initial);
  if (!items.length) return <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={async () => { await api("/api/v1/notifications", { body: { ids: "all" } }); setItems((x) => x.map((n) => ({ ...n, read_at: n.read_at ?? Date.now() }))); }}>
          Mark all read
        </Button>
      </div>
      <Panel>
        <ul className="divide-y divide-border">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read_at && "bg-accent-soft/40")}>
              <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={n.kind === "security.event" || n.kind === "server.disconnected" ? "warning" : "neutral"}>{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                  {n.link ? <Link href={n.link} className="text-sm hover:underline" onClick={() => !n.read_at && api("/api/v1/notifications", { body: { ids: [n.id] } }).catch(() => {})}>{n.title}</Link> : <span className="text-sm">{n.title}</span>}
                </div>
                {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                <p className="text-[11px] text-faint"><RelativeTime ts={n.created_at} /></p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
