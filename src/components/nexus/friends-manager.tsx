"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { FriendView } from "@/modules/nexusid/social";

export function FriendsManager({ friends, blocks, verified }: { friends: FriendView[]; blocks: { user_id: string; username: string }[]; verified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendView | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "incoming");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  const row = (f: FriendView, actions: React.ReactNode) => (
    <li key={f.friendship_id} className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={f.display_name} size={28} />
      <Link href={`/u/${f.username}`} className="min-w-0 flex-1 hover:underline">
        <div className="truncate text-sm">{f.display_name}</div>
        <div className="truncate text-xs text-faint">@{f.username}</div>
      </Link>
      <div className="flex gap-1.5">{actions}</div>
    </li>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {incoming.length > 0 && (
          <Panel>
            <PanelHeader title={`Incoming requests (${incoming.length})`} />
            <ul className="divide-y divide-border">
              {incoming.map((f) =>
                row(
                  f,
                  <>
                    <Button size="sm" variant="primary" loading={busy === f.friendship_id} onClick={() => act(f.friendship_id, () => api(`/api/v1/nexus/friends/${f.friendship_id}`, { body: { action: "accept" } }), `You're now friends with ${f.username}`)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(f.friendship_id, () => api(`/api/v1/nexus/friends/${f.friendship_id}`, { body: { action: "decline" } }))}>
                      Decline
                    </Button>
                  </>,
                ),
              )}
            </ul>
          </Panel>
        )}
        <Panel>
          <PanelHeader title={`Friends (${accepted.length})`} />
          {accepted.length === 0 ? (
            <PanelBody>
              <EmptyState icon={<Users className="h-6 w-6" />} title="No friends yet" description="Add players by their SythiX username." />
            </PanelBody>
          ) : (
            <ul className="divide-y divide-border">
              {accepted.map((f) =>
                row(
                  f,
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(f)}>
                    Remove
                  </Button>,
                ),
              )}
            </ul>
          )}
        </Panel>
        {outgoing.length > 0 && (
          <Panel>
            <PanelHeader title="Sent requests" />
            <ul className="divide-y divide-border">
              {outgoing.map((f) =>
                row(
                  f,
                  <Button size="sm" variant="ghost" onClick={() => act(f.friendship_id, () => api(`/api/v1/nexus/friends/${f.friendship_id}`, { method: "DELETE" }), "Request cancelled")}>
                    Cancel
                  </Button>,
                ),
              )}
            </ul>
          </Panel>
        )}
      </div>
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Add a friend" />
          <PanelBody>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  "add",
                  async () => {
                    const r = await api<{ status: string }>("/api/v1/nexus/friends", { body: { username } });
                    toast.success(r.status === "accepted" ? `You're now friends with ${username}` : `Request sent to ${username}`);
                    setUsername("");
                  },
                );
              }}
            >
              <Input placeholder="Username" aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!verified} />
              <Button type="submit" variant="primary" loading={busy === "add"} disabled={!username.trim() || !verified}>
                <UserPlus className="h-3.5 w-3.5" /> Add
              </Button>
            </form>
            {!verified && <p className="mt-2 text-xs text-warning">Verify your email to send friend requests.</p>}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Blocked players" description="Blocked players can't see your profile or contact you." />
          {blocks.length === 0 ? (
            <PanelBody className="text-xs text-muted">You haven&apos;t blocked anyone.</PanelBody>
          ) : (
            <ul className="divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                  @{b.username}
                  <Button size="sm" variant="ghost" loading={busy === b.user_id} onClick={() => act(b.user_id, () => api(`/api/v1/nexus/blocks/${b.user_id}`, { method: "DELETE" }), "Unblocked")}>
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.username}?`}
        description="You can send a new request later."
        confirmLabel="Remove friend"
        danger
        loading={busy === removing?.friendship_id}
        onConfirm={() => removing && act(removing.friendship_id, () => api(`/api/v1/nexus/friends/${removing.friendship_id}`, { method: "DELETE" })).then(() => setRemoving(null))}
      />
    </div>
  );
}
