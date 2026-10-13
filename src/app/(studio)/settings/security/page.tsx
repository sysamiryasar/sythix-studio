import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listSessions } from "@/lib/auth/session";
import { SessionList, ChangePasswordForm } from "@/components/settings/security";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { all } from "@/lib/db/sql";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const { user, ctx } = await requireUser();
  const sessions = await listSessions(ctx, user.id);
  const events = await all<{ action: string; ip: string | null; created_at: number }>(
    ctx.db,
    `SELECT action, ip, created_at FROM audit_events WHERE actor_id = ? AND action LIKE 'account.%' ORDER BY created_at DESC LIMIT 15`,
    user.id,
  );
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Active sessions" description="Sign out of devices you don't recognise. Sessions expire after 30 days of inactivity." />
        <SessionList sessions={sessions} current={user.sessionId} />
      </Panel>
      <Panel>
        <PanelHeader title="Change password" description="Changing your password signs out every other session." />
        <PanelBody>
          <ChangePasswordForm />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Recent security activity" />
        <ul className="divide-y divide-border text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex justify-between px-4 py-2">
              <span className="font-mono text-xs text-muted">{e.action}</span>
              <span className="text-xs text-faint">
                {e.ip ?? "unknown IP"} · {formatRelative(e.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
