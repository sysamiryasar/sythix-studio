"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface Report {
  id: string;
  reporter: string;
  target_type: string;
  target_id: string;
  target_label: string | null;
  reason: string;
  details: string;
  created_at: number;
}

export function ReportsQueue({ reports: initial }: { reports: Report[] }) {
  const [reports, setReports] = useState(initial);
  const toast = useToast();
  if (!reports.length) return <EmptyState icon={<Flag className="h-6 w-6" />} title="No open reports" />;
  return (
    <Panel>
      <ul className="divide-y divide-border">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="danger">{r.reason.replace("_", " ")}</Badge>
                <span>
                  {r.target_type}:{" "}
                  {r.target_type === "user" && r.target_label ? <Link className="text-accent hover:underline" href={`/u/${r.target_label}`}>@{r.target_label}</Link> : r.target_label ?? r.target_id}
                </span>
              </div>
              {r.details && <p className="mt-1 text-xs text-muted">{r.details}</p>}
              <p className="mt-1 text-[11px] text-faint">
                Reported by @{r.reporter} · {formatRelative(r.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              {(["resolved", "dismissed"] as const).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === "resolved" ? "primary" : "ghost"}
                  onClick={async () => {
                    try {
                      await api(`/api/v1/admin/reports/${r.id}`, { method: "PATCH", body: { status } });
                      setReports((xs) => xs.filter((x) => x.id !== r.id));
                      toast.success(`Report ${status}`);
                    } catch (e) {
                      toast.error("Update failed", (e as Error).message);
                    }
                  }}
                >
                  {status === "resolved" ? "Resolve" : "Dismiss"}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
