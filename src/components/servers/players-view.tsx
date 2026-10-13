"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface Data {
  players: { uuid: string; name: string; online: number; first_seen_at: number; last_seen_at: number }[];
  bans: { uuid: string; name: string; reason: string | null; source: string | null; created: string | null; expires: string | null }[];
  history: { id: string; player_name: string; action: string; reason: string; created_at: number; actor: string; status: string | null }[];
}

export function PlayersView({ serverId, data, online, canModerate, environment, simulated }: { serverId: string; data: Data; online: boolean; canModerate: boolean; environment: string; simulated: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [action, setAction] = useState<{ kind: "kick" | "ban" | "unban"; player: string; uuid?: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>(`/api/v1/servers/${serverId}/players`, { body: { action: action.kind, player: action.player, uuid: action.uuid, reason } });
      toast.info("Sent to the agent", "Waiting for the server's response…");
      setAction(null);
      setReason("");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const c = await api<{ status: string; result: { data?: { output?: string }; error?: string } | null }>(`/api/v1/servers/${serverId}/commands/${id}`);
        if (c.status === "succeeded") {
          toast.success(`${action.kind} completed`, c.result?.data?.output);
          break;
        }
        if (c.status === "failed" || c.status === "expired") {
          toast.error(`${action.kind} failed`, c.result?.error ?? c.status);
          break;
        }
      }
      router.refresh();
    } catch (e) {
      toast.error("Not sent", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onlinePlayers = data.players.filter((p) => p.online);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel>
        <PanelHeader title={`Online (${online ? onlinePlayers.length : "unknown"})`} description={online ? (simulated ? "Sample players from the simulated agent." : "Reported by the agent via RCON.") : "Server disconnected — online status unknown."} />
        <ul className="divide-y divide-border">
          {(online ? onlinePlayers : []).map((p) => (
            <li key={p.uuid} className="flex items-center gap-3 px-4 py-2">
              <Avatar name={p.name} minecraftUuid={simulated ? null : p.uuid} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <StatusDot tone="success" label="Online" /> {p.name}
                </div>
                <div className="truncate font-mono text-[10px] text-faint">{p.uuid}</div>
              </div>
              {canModerate && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "kick", player: p.name, uuid: p.uuid })}>Kick</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "ban", player: p.name, uuid: p.uuid })}>Ban</Button>
                </span>
              )}
            </li>
          ))}
          {online && onlinePlayers.length === 0 && <li className="px-4 py-3 text-xs text-muted">Nobody is online.</li>}
        </ul>
        {canModerate && online && (
          <PanelBody className="border-t border-border">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual) setAction({ kind: "ban", player: manual }); }}>
              <Input aria-label="Player name" placeholder="Ban an offline player by name" value={manual} onChange={(e) => setManual(e.target.value)} maxLength={16} />
              <Button type="submit" variant="outline" disabled={!/^[A-Za-z0-9_]{3,16}$/.test(manual)}>Ban</Button>
            </form>
          </PanelBody>
        )}
      </Panel>
      <div className="space-y-6">
        <Panel>
          <PanelHeader title={`Bans (${data.bans.length})`} description="From banned-players.json as last reported by the agent." />
          <ul className="divide-y divide-border">
            {data.bans.length === 0 && <li className="px-4 py-3 text-xs text-muted">No bans reported.</li>}
            {data.bans.map((b) => (
              <li key={b.uuid} className="flex items-center gap-3 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  {b.name}
                  <div className="truncate text-[11px] text-faint">{b.reason ?? "No reason"} · by {b.source ?? "?"} · expires {b.expires ?? "never"}</div>
                </div>
                {canModerate && online && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "unban", player: b.name, uuid: b.uuid })}>Unban</Button>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Moderation history" />
          <ul className="divide-y divide-border text-sm">
            {data.history.length === 0 && <li className="px-4 py-3 text-xs text-muted">No moderation actions yet.</li>}
            {data.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span>
                  <Badge tone={h.action === "ban" ? "danger" : h.action === "kick" ? "warning" : "success"}>{h.action}</Badge> {h.player_name}
                  {h.reason && <span className="text-xs text-muted"> — {h.reason}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-faint">
                  @{h.actor} · {formatRelative(h.created_at)} · {h.status ?? "unknown"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-[11px] text-faint">Player list from {data.players.length} known players. Last seen times update while the agent is connected.</p>
      </div>
      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        title={`${action?.kind === "unban" ? "Unban" : action?.kind === "ban" ? "Ban" : "Kick"} ${action?.player}?`}
        description={environment === "production" ? "This is a production server." : undefined}
        confirmLabel={action?.kind ?? ""}
        danger={action?.kind !== "unban"}
        loading={busy}
        onConfirm={submit}
      >
        {action?.kind !== "unban" && <Field label="Reason (shown to the player)">{(p) => <Input {...p} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
      </ConfirmDialog>
    </div>
  );
}
