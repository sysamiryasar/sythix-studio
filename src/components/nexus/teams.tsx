"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Shield } from "lucide-react";
import { api } from "@/lib/client/api";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, PageHeader, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

interface TeamListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: string;
  role: string;
  status: string;
  members: number;
}

export function TeamsList({ teams, verified }: { teams: TeamListItem[]; verified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "public" });
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <PageHeader
        title="Teams"
        description="Groups of players and creators. Teams are social; they do not grant access to workspaces or servers."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)} disabled={!verified} title={verified ? undefined : "Verify your email first"}>
            <Plus className="h-4 w-4" /> New team
          </Button>
        }
      />
      {teams.length === 0 ? (
        <EmptyState icon={<Shield className="h-6 w-6" />} title="You're not in any teams" description="Create one and invite your friends." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/nexus/teams/${t.slug}`} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                {t.status === "invited" && <Badge tone="accent">Invitation</Badge>}
                {t.role === "owner" && <Badge>Owner</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{t.description || "No description."}</p>
              <p className="mt-2 text-[11px] text-faint">
                {t.members} member{t.members === 1 ? "" : "s"} · {t.visibility}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create a team"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={form.name.trim().length < 2}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ slug: string }>("/api/v1/nexus/teams", { body: form });
                  router.push(`/nexus/teams/${r.slug}`);
                } catch (e) {
                  toast.error("Team not created", (e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Create team
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">{(p) => <Input {...p} maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Description">{(p) => <Textarea {...p} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <Field label="Visibility" hint="Private teams are visible only to members and invitees.">
            {(p) => (
              <Select {...p} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </Select>
            )}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

interface TeamDetailData {
  team: { id: string; slug: string; name: string; description: string; visibility: string };
  members: { user_id: string; username: string; display_name: string; role: string; status: string }[];
  viewerRole: "owner" | "member" | null;
  viewerInvited: boolean;
}

export function TeamDetail({ data, currentUserId }: { data: TeamDetailData; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const { team } = data;
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      if (after) after();
      else router.refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow={`Team · ${team.visibility}`}
        title={team.name}
        description={team.description || undefined}
        actions={
          data.viewerInvited ? (
            <>
              <Button variant="primary" loading={busy === "accept"} onClick={() => act("accept", () => api(`/api/v1/nexus/teams/${team.id}/members/me`, { body: { action: "accept" } }), "Joined team")}>
                Accept invitation
              </Button>
              <Button variant="ghost" onClick={() => act("decline", () => api(`/api/v1/nexus/teams/${team.id}/members/me`, { body: { action: "decline" } }), undefined, () => router.push("/nexus/teams"))}>
                Decline
              </Button>
            </>
          ) : data.viewerRole === "owner" ? (
            <Button variant="danger" onClick={() => setConfirm("delete")}>
              Delete team
            </Button>
          ) : data.viewerRole === "member" ? (
            <Button variant="outline" onClick={() => setConfirm("leave")}>
              Leave team
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel>
          <PanelHeader title="Members" />
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={m.display_name} size={28} />
                <Link href={`/u/${m.username}`} className="flex-1 text-sm hover:underline">
                  {m.display_name} <span className="text-xs text-faint">@{m.username}</span>
                </Link>
                {m.role === "owner" && <Badge tone="accent">Owner</Badge>}
                {m.status === "invited" && <Badge>Invited</Badge>}
                {data.viewerRole === "owner" && m.user_id !== currentUserId && (
                  <Button size="sm" variant="ghost" loading={busy === m.user_id} onClick={() => act(m.user_id, () => api(`/api/v1/nexus/teams/${team.id}/members/${m.user_id}`, { method: "DELETE" }), "Removed")}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
        {data.viewerRole === "owner" && (
          <Panel className="h-fit">
            <PanelHeader title="Invite a player" />
            <PanelBody>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("invite", () => api(`/api/v1/nexus/teams/${team.id}/members`, { body: { username: invite } }), `Invited ${invite}`).then(() => setInvite(""));
                }}
              >
                <Input aria-label="Username" placeholder="Username" value={invite} onChange={(e) => setInvite(e.target.value)} />
                <Button type="submit" variant="primary" loading={busy === "invite"} disabled={!invite.trim()}>
                  Invite
                </Button>
              </form>
            </PanelBody>
          </Panel>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "delete" ? `Delete ${team.name}?` : `Leave ${team.name}?`}
        description={confirm === "delete" ? "This permanently removes the team and all memberships." : "You'll need a new invitation to rejoin."}
        confirmText={confirm === "delete" ? team.slug : undefined}
        confirmLabel={confirm === "delete" ? "Delete team" : "Leave team"}
        danger
        loading={busy === "confirm"}
        onConfirm={() =>
          act(
            "confirm",
            () => (confirm === "delete" ? api(`/api/v1/nexus/teams/${team.id}`, { method: "DELETE" }) : api(`/api/v1/nexus/teams/${team.id}/members/me`, { method: "DELETE" })),
            confirm === "delete" ? "Team deleted" : "You left the team",
            () => router.push("/nexus/teams"),
          )
        }
      />
    </div>
  );
}
