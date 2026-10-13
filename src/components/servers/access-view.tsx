"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/client/api";
import { ROLE_LABELS, SERVER_MATRIX, type ServerRole } from "@/lib/authz/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { AgentInstructions, CopyBlock } from "./connect-wizard";

interface Member {
  user_id: string;
  username: string;
  display_name: string;
  role: ServerRole;
}
interface Credential {
  id: string;
  token_prefix: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  created_by_name: string;
}

export function AccessView({ serverId, appUrl, members, credentials, canManageMembers, currentUserId }: { serverId: string; appUrl: string; members: Member[]; credentials: Credential[] | null; canManageMembers: boolean; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ServerRole>("server_viewer");
  const [issueOpen, setIssueOpen] = useState(false);
  const [label, setLabel] = useState("Agent credential");
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Server members" description="Roles apply to this server only. Workspace roles never grant server access." />
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                {m.display_name} <span className="text-xs text-faint">@{m.username}</span>
              </div>
              {canManageMembers && m.user_id !== currentUserId ? (
                <>
                  <Select aria-label={`Role for ${m.username}`} className="h-8 w-48" value={m.role} onChange={(e) => act(() => api(`/api/v1/servers/${serverId}/members`, { body: { username: m.username, role: e.target.value } }), "Role updated")}>
                    {(Object.keys(SERVER_MATRIX) as ServerRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/v1/servers/${serverId}/members/${m.user_id}`, { method: "DELETE" }), "Member removed")}>Remove</Button>
                </>
              ) : (
                <Badge>{ROLE_LABELS[m.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
        {canManageMembers && (
          <PanelBody className="border-t border-border">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api(`/api/v1/servers/${serverId}/members`, { body: { username, role } }), `Granted ${ROLE_LABELS[role]} to ${username}`).then(() => setUsername(""));
              }}
            >
              <Input aria-label="Workspace member username" placeholder="Workspace member username" className="w-60" value={username} onChange={(e) => setUsername(e.target.value)} />
              <Select aria-label="Role" className="w-48" value={role} onChange={(e) => setRole(e.target.value as ServerRole)}>
                {(Object.keys(SERVER_MATRIX) as ServerRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
              <Button type="submit" variant="primary" disabled={!username.trim()} loading={busy}>Grant</Button>
            </form>
            <p className="mt-2 text-[11px] text-faint">Moderators can read the console and moderate players; only administrators can run commands, edit configs, deploy or manage credentials.</p>
          </PanelBody>
        )}
      </Panel>

      {credentials && (
        <Panel>
          <PanelHeader
            title="Agent credentials"
            description="Only a hash of each token is stored. Revocation takes effect on the agent's next request."
            actions={<Button size="sm" variant="primary" onClick={() => { setNewToken(null); setIssueOpen(true); }}><KeyRound className="h-3.5 w-3.5" /> Issue / rotate</Button>}
          />
          <ul className="divide-y divide-border">
            {credentials.length === 0 && <li className="px-4 py-3 text-xs text-muted">No credentials issued.</li>}
            {credentials.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  {c.label} <span className="font-mono text-xs text-faint">sxa_{c.token_prefix}_…</span>
                  <div className="text-[11px] text-faint">
                    by @{c.created_by_name} <RelativeTime ts={c.created_at} /> · last used <RelativeTime ts={c.last_used_at} />
                  </div>
                </div>
                {c.revoked_at ? <Badge>Revoked <RelativeTime ts={c.revoked_at} /></Badge> : (
                  <>
                    <Badge tone="success">Active</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(c)}>Revoke</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog open={issueOpen} onClose={() => { setIssueOpen(false); router.refresh(); }} title={newToken ? "Credential issued" : "Issue an agent credential"} size="lg"
        footer={!newToken && (
          <>
            <Button variant="ghost" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ token: string }>(`/api/v1/servers/${serverId}/credentials`, { body: { label, revokeOthers } });
                setNewToken(r.token);
              } catch (e) {
                toast.error("Not issued", (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>Issue credential</Button>
          </>
        )}
      >
        {newToken ? (
          <div className="space-y-4">
            <p className="text-sm text-warning">Copy this token now — it will not be shown again.</p>
            <CopyBlock text={newToken} />
            <AgentInstructions token={newToken} appUrl={appUrl} />
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Label">{(p) => <Input {...p} maxLength={64} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch label="Revoke all other credentials" checked={revokeOthers} onChange={setRevokeOthers} /> Rotate: revoke all other active credentials for this server
            </label>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.label}?`}
        description="Any agent using this credential is disconnected on its next request."
        confirmLabel="Revoke"
        danger
        loading={busy}
        onConfirm={() => act(() => api(`/api/v1/servers/${serverId}/credentials/${revoking!.id}`, { method: "DELETE" }), "Credential revoked").then(() => setRevoking(null))}
      />
    </div>
  );
}
