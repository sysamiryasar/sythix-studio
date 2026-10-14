import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/panel";

export interface AuditRow {
  id: string;
  actor_type: string;
  actor: string | null;
  action: string;
  metadata: string | null;
  created_at: number;
  ip: string | null;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <EmptyState title="No audit events" />;
  return (
    <Panel>
      <div className="sx-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">Time (UTC)</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(r.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {r.actor_type !== "user" && <Badge className="mr-1">{r.actor_type}</Badge>}
                  {r.actor ?? "—"}
                  {r.ip && <div className="text-[10px] text-faint">{r.ip}</div>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-[11px] text-faint" title={r.metadata ?? ""}>{r.metadata ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
