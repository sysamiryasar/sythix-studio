import Link from "next/link";
import { Rocket } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { listServerDeployments } from "@/modules/ecosystem/deployments";
import { parseJson } from "@/lib/db/sql";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/panel";

const TONE = { succeeded: "success", failed: "danger", dispatched: "info", planned: "neutral", cancelled: "neutral" } as const;

export default async function ServerDeploymentsPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  await getServer(ctx, user, serverId);
  const rows = await listServerDeployments(ctx, serverId);
  if (!rows.length) return <EmptyState icon={<Rocket className="h-6 w-6" />} title="No deployments yet" description="Deploy a validated ForgeOS datapack export from its project's Validate & export tab." />;
  return (
    <Panel>
      <ul className="divide-y divide-border">
        {rows.map((d) => {
          const r = parseJson<{ ok: boolean; data?: { path?: string; note?: string }; error?: string } | null>(d.result, null);
          return (
            <li key={d.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/forge/${d.project_id}`} className="font-medium hover:underline">
                  {d.project_name}
                </Link>{" "}
                <span className="text-xs text-faint">r{d.revision}</span>
                <div className="text-[11px] text-faint">
                  @{d.requested_by} · {formatRelative(d.created_at)} {r?.data?.path ? `· ${r.data.path}` : ""} {r?.error ? `· ${r.error}` : ""}
                </div>
              </div>
              <Badge tone={TONE[d.status as keyof typeof TONE] ?? "neutral"}>{d.status}</Badge>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
