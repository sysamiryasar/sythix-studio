import { useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Lock, Megaphone, MessagesSquare, Plus, Settings2, UserPlus, Users, Volume2, LogOut, Copy, Search } from "lucide-react";
import type { ChannelView, CommunitySummary, ConversationView, UserSummary } from "@shared/types";
import { communityCan, outranks, COMMUNITY_ROLES, type CommunityRole } from "@shared/permissions";
import { api, errorMessage } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useMe } from "../lib/session";
import { Avatar, Badge, Button, ButtonLink, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Panel, Select, Spinner, Textarea, cn, useToast } from "../components/ui";
import { Chat } from "../components/chat";
import { ReportDialog } from "../components/social";

function CommunityCard({ c }: { c: CommunitySummary }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const join = useMutation({
    mutationFn: () => api(`/communities/${c.slug}/join`, { body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["communities"] });
      navigate(`/connect/c/${c.slug}`);
    },
    onError: (e) => toast.error("Couldn't join", errorMessage(e)),
  });
  return (
    <Panel className="flex flex-col p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-strong to-cyan font-display text-lg font-semibold text-white">{c.name[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <Link to={`/connect/c/${c.slug}`} className="block truncate font-medium hover:underline">
            {c.name}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-faint">
            {c.visibility === "private" && <Lock className="h-3 w-3" />}
            {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
            {c.myRole && <Badge tone="accent">{c.myRole}</Badge>}
          </p>
        </div>
      </div>
      {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p>}
      <div className="mt-auto pt-3">
        {c.myRole ? (
          <ButtonLink to={`/connect/c/${c.slug}`} size="sm" variant="outline">
            Open
          </ButtonLink>
        ) : (
          <Button size="sm" variant="primary" loading={join.isPending} onClick={() => join.mutate()}>
            Join
          </Button>
        )}
      </div>
    </Panel>
  );
}

function CreateCommunityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", slug: "", description: "", visibility: "public" as "public" | "private" });
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useMutation({
    mutationFn: () => api<CommunitySummary>("/communities", { body: form }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["communities"] });
      onClose();
      navigate(`/connect/c/${c.slug}`);
    },
    onError: (e) => toast.error("Couldn't create community", errorMessage(e)),
  });
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return (
    <Dialog open={open} onClose={onClose} title="Create a community">
      <div className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} value={form.name} maxLength={50} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))} autoFocus />}</Field>
        <Field label="Address" hint={`unite/c/${form.slug || "your-community"}`}>
          {(id, d) => <Input id={id} aria-describedby={d} value={form.slug} onChange={(e) => (setSlugTouched(true), setForm((f) => ({ ...f, slug: slugify(e.target.value) })))} />}
        </Field>
        <Field label="Description">{(id) => <Textarea id={id} rows={2} maxLength={500} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}</Field>
        <Field label="Who can join">
          {(id) => (
            <Select id={id} value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as "public" | "private" }))}>
              <option value="public">Anyone (listed in Discover)</option>
              <option value="private">Invite only (hidden)</option>
            </Select>
          )}
        </Field>
        <p className="text-xs text-faint">You'll start with #general and #announcements. You can add channels and roles later.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={form.name.length < 2 || form.slug.length < 3} loading={create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ConnectHomePage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const data = useQuery({ queryKey: ["communities", q], queryFn: () => api<{ mine: CommunitySummary[]; discover: CommunitySummary[] }>(`/communities${q ? `?q=${encodeURIComponent(q)}` : ""}`) });
  const creating = params.get("create") === "1";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SythiX Connect"
        title="Communities"
        description="Spaces with channels, roles and real-time chat."
        actions={
          <Button variant="primary" onClick={() => setParams({ create: "1" })}>
            <Plus className="h-4 w-4" /> Create community
          </Button>
        }
      />
      {data.isPending ? (
        <Spinner />
      ) : data.isError ? (
        <ErrorState error={data.error} retry={() => data.refetch()} />
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">Your communities</h2>
            {data.data.mine.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.data.mine.map((c) => (
                  <CommunityCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Users className="h-6 w-6" />} title="You're not in any communities yet" description="Join one below or create your own." />
            )}
          </section>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">Discover</h2>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find communities" aria-label="Find communities" className="pl-9" />
              </div>
            </div>
            {data.data.discover.filter((c) => !c.myRole).length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.data.discover
                  .filter((c) => !c.myRole)
                  .map((c) => (
                    <CommunityCard key={c.id} c={c} />
                  ))}
              </div>
            ) : (
              <p className="text-sm text-faint">No public communities to discover{q ? " for that search" : " yet"}.</p>
            )}
          </section>
        </>
      )}
      <CreateCommunityDialog open={creating} onClose={() => setParams({})} />
    </div>
  );
}

const CHANNEL_ICON = { text: <Hash className="h-4 w-4" />, announcement: <Megaphone className="h-4 w-4" />, voice: <Volume2 className="h-4 w-4" /> };

function VoiceUnavailable({ name }: { name: string }) {
  const q = useQuery({ queryKey: ["voice"], queryFn: () => api<{ available: boolean; reason: string; requirements: string[] }>("/voice/status") });
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Volume2 className="h-8 w-8 text-faint" />
      <h2 className="mt-3 font-display text-lg font-semibold">{name}: voice unavailable</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{q.data?.reason ?? "Checking media infrastructure…"}</p>
      {q.data && (
        <ul className="mt-4 max-w-md list-disc space-y-1 pl-5 text-left text-xs text-faint">
          {q.data.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-faint">Calls are never simulated. This room will work once an administrator configures a media server.</p>
    </div>
  );
}

export function CommunityPage() {
  const { slug = "", channelId } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [settings, setSettings] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const q = useQuery({ queryKey: ["community", slug], queryFn: () => api<{ community: CommunitySummary; channels: ChannelView[]; isOwner: boolean }>(`/communities/${slug}`), refetchInterval: 30_000 });
  const join = useMutation({
    mutationFn: () => api(`/communities/${slug}/join`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community", slug] }),
    onError: (e) => toast.error("Couldn't join", errorMessage(e)),
  });
  const leave = useMutation({
    mutationFn: () => api(`/communities/${slug}/leave`, { body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["communities"] });
      navigate("/connect");
    },
    onError: (e) => toast.error("Couldn't leave", errorMessage(e)),
  });
  const makeInvite = useMutation({
    mutationFn: () => api<{ code: string }>(`/communities/${slug}/invites`, { body: { expiresInHours: 168 } }),
    onSuccess: (r) => setInvite(`${location.origin}/invite/${r.code}`),
    onError: (e) => toast.error("Couldn't create invite", errorMessage(e)),
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} />;
  const { community: c, channels } = q.data;
  if (!c.myRole) {
    return (
      <div className="mx-auto max-w-lg">
        <Panel className="p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">{c.name}</h1>
          <p className="mt-1 text-sm text-faint">{c.memberCount} members</p>
          {c.description && <p className="mt-3 text-sm text-muted">{c.description}</p>}
          <Button className="mt-5" variant="primary" loading={join.isPending} onClick={() => join.mutate()}>
            Join community
          </Button>
        </Panel>
      </div>
    );
  }
  const active = channels.find((ch) => ch.id === channelId) ?? channels.find((ch) => ch.kind !== "voice") ?? channels[0];
  const canManage = communityCan(c.myRole, "community.manage") || communityCan(c.myRole, "member.kick");

  return (
    <div className="-mx-4 -my-6 grid h-[calc(100dvh-3.5rem)] grid-cols-1 sm:-mx-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden flex-col border-r border-border bg-surface/60 md:flex">
        <div className="border-b border-border p-4">
          <h1 className="truncate font-display font-semibold">{c.name}</h1>
          <p className="text-xs text-faint">
            {c.memberCount} members · <span className="capitalize">{c.myRole}</span>
          </p>
        </div>
        <nav aria-label="Channels" className="sx-scroll flex-1 overflow-y-auto p-2">
          {channels.map((ch) => (
            <NavLink
              key={ch.id}
              to={`/connect/c/${slug}/${ch.id}`}
              className={() => cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", ch.id === active?.id ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg", ch.unread && ch.id !== active?.id && "font-semibold text-fg")}
            >
              <span className="text-faint">{CHANNEL_ICON[ch.kind]}</span>
              <span className="flex-1 truncate">{ch.name}</span>
              {ch.minRole !== "member" && <Lock className="h-3 w-3 text-faint" aria-label="Restricted" />}
              {ch.unread && ch.id !== active?.id && <span className="h-2 w-2 rounded-full bg-magenta" aria-label="Unread" />}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border p-2">
          <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => makeInvite.mutate()} loading={makeInvite.isPending}>
            <UserPlus className="h-4 w-4" /> Invite people
          </Button>
          {canManage && (
            <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => setSettings(true)}>
              <Settings2 className="h-4 w-4" /> Manage
            </Button>
          )}
          {c.myRole !== "owner" && (
            <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => leave.mutate()}>
              <LogOut className="h-4 w-4" /> Leave
            </Button>
          )}
          {c.myRole !== "owner" && (
            <button onClick={() => setReporting(true)} className="w-full px-3 py-1 text-left text-xs text-faint hover:text-fg">
              Report community
            </button>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col">
        <div className="flex gap-2 overflow-x-auto border-b border-border p-2 md:hidden">
          {channels.map((ch) => (
            <Link key={ch.id} to={`/connect/c/${slug}/${ch.id}`} className={cn("flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-sm", ch.id === active?.id ? "bg-accent-soft" : "text-muted")}>
              {CHANNEL_ICON[ch.kind]} {ch.name}
            </Link>
          ))}
          <button onClick={() => makeInvite.mutate()} className="shrink-0 rounded-lg px-2.5 py-1 text-sm text-muted">
            Invite
          </button>
          {canManage && (
            <button onClick={() => setSettings(true)} className="shrink-0 rounded-lg px-2.5 py-1 text-sm text-muted">
              Manage
            </button>
          )}
        </div>
        {!active ? (
          <EmptyState title="No channels you can see" />
        ) : active.kind === "voice" ? (
          <VoiceUnavailable name={active.name} />
        ) : (
          <Chat key={active.id} kind="channels" id={active.id} title={`#${active.name}`} readOnlyReason={active.kind === "announcement" ? "Only moderators and above can post announcements." : undefined} />
        )}
      </section>
      <Dialog open={!!invite} onClose={() => setInvite(null)} title="Invite link">
        <p className="text-sm text-muted">Anyone with this link can join for the next 7 days.</p>
        <div className="mt-3 flex gap-2">
          <Input readOnly value={invite ?? ""} aria-label="Invite link" onFocus={(e) => e.target.select()} />
          <Button onClick={() => (navigator.clipboard?.writeText(invite ?? ""), toast.success("Copied"))} aria-label="Copy invite link">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </Dialog>
      {settings && <ManageDialog slug={slug} myRole={c.myRole} community={c} channels={channels} onClose={() => setSettings(false)} meId={me.id} />}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="community" targetId={c.id} />
    </div>
  );
}

function ManageDialog({ slug, myRole, community, channels, onClose, meId }: { slug: string; myRole: CommunityRole; community: CommunitySummary; channels: ChannelView[]; onClose: () => void; meId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"members" | "channels" | "general">("members");
  const members = useQuery({ queryKey: ["members", slug], queryFn: () => api<{ user: UserSummary; role: CommunityRole; joinedAt: number }[]>(`/communities/${slug}/members`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["members", slug] });
    void qc.invalidateQueries({ queryKey: ["community", slug] });
  };
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh, onError: (e) => toast.error("That didn't work", errorMessage(e)) });
  const [newCh, setNewCh] = useState({ name: "", kind: "text" as ChannelView["kind"], minRole: "member" as "member" | "moderator" | "admin", topic: "" });
  const [general, setGeneral] = useState({ name: community.name, description: community.description, visibility: community.visibility });
  const [confirmDelete, setConfirmDelete] = useState("");

  return (
    <Dialog open onClose={onClose} title={`Manage ${community.name}`} wide>
      <div className="mb-4 flex gap-1 rounded-xl border border-border p-1" role="tablist">
        {(["members", "channels", "general"] as const)
          .filter((t) => t === "members" || communityCan(myRole, t === "channels" ? "channel.manage" : "community.manage"))
          .map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm capitalize", tab === t ? "bg-accent-soft font-medium" : "text-muted")}>
              {t}
            </button>
          ))}
      </div>
      {tab === "members" &&
        (members.isPending ? (
          <Spinner />
        ) : (
          <ul className="sx-scroll max-h-96 divide-y divide-border overflow-y-auto">
            {members.data?.map((m) => {
              const actionable = m.user.id !== meId && outranks(myRole, m.role);
              return (
                <li key={m.user.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Avatar user={m.user} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{m.user.displayName}</span>
                    <span className="block text-xs text-faint">
                      @{m.user.username} · joined {relativeTime(m.joinedAt)}
                    </span>
                  </span>
                  {actionable && communityCan(myRole, "member.set_role") ? (
                    <Select
                      aria-label={`Role for ${m.user.username}`}
                      value={m.role}
                      onChange={(e) => act.mutate(() => api(`/communities/${slug}/members/${m.user.id}`, { body: { type: "role", role: e.target.value } }))}
                      className="h-8 w-32 py-0 text-xs"
                    >
                      {COMMUNITY_ROLES.filter((r) => r !== "owner" && outranks(myRole, r)).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={m.role === "member" ? "default" : "accent"}>{m.role}</Badge>
                  )}
                  {actionable && communityCan(myRole, "member.kick") && (
                    <Button size="sm" variant="ghost" onClick={() => act.mutate(() => api(`/communities/${slug}/members/${m.user.id}`, { body: { type: "kick" } }))}>
                      Kick
                    </Button>
                  )}
                  {actionable && communityCan(myRole, "member.ban") && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate(() => api(`/communities/${slug}/members/${m.user.id}`, { body: { type: "ban" } }))}>
                      Ban
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      {tab === "channels" && (
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                {CHANNEL_ICON[ch.kind]}
                <span className="flex-1">{ch.name}</span>
                {ch.minRole !== "member" && <Badge>{ch.minRole}+</Badge>}
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate(() => api(`/channels/${ch.id}`, { method: "DELETE" }))}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="New channel">{(id) => <Input id={id} placeholder="channel-name" value={newCh.name} onChange={(e) => setNewCh((c) => ({ ...c, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} />}</Field>
            <Field label="Type">
              {(id) => (
                <Select id={id} value={newCh.kind} onChange={(e) => setNewCh((c) => ({ ...c, kind: e.target.value as ChannelView["kind"] }))}>
                  <option value="text">Text</option>
                  <option value="announcement">Announcements</option>
                  <option value="voice">Voice (needs media server)</option>
                </Select>
              )}
            </Field>
            <Field label="Visible to">
              {(id) => (
                <Select id={id} value={newCh.minRole} onChange={(e) => setNewCh((c) => ({ ...c, minRole: e.target.value as typeof c.minRole }))}>
                  <option value="member">Everyone</option>
                  <option value="moderator">Moderators+</option>
                  <option value="admin">Admins+</option>
                </Select>
              )}
            </Field>
          </div>
          <Button variant="primary" disabled={!newCh.name} loading={act.isPending} onClick={() => act.mutate(() => api(`/communities/${slug}/channels`, { body: newCh }).then(() => setNewCh((c) => ({ ...c, name: "" }))))}>
            <Plus className="h-4 w-4" /> Add channel
          </Button>
        </div>
      )}
      {tab === "general" && (
        <div className="space-y-4">
          <Field label="Name">{(id) => <Input id={id} value={general.name} maxLength={50} onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))} />}</Field>
          <Field label="Description">{(id) => <Textarea id={id} rows={3} maxLength={500} value={general.description} onChange={(e) => setGeneral((g) => ({ ...g, description: e.target.value }))} />}</Field>
          <Field label="Who can join">
            {(id) => (
              <Select id={id} value={general.visibility} onChange={(e) => setGeneral((g) => ({ ...g, visibility: e.target.value as "public" | "private" }))}>
                <option value="public">Anyone</option>
                <option value="private">Invite only</option>
              </Select>
            )}
          </Field>
          <Button variant="primary" loading={act.isPending} onClick={() => act.mutate(() => api(`/communities/${slug}`, { method: "PATCH", body: general }).then(() => toast.success("Saved")))}>
            Save
          </Button>
          {communityCan(myRole, "community.delete") && (
            <div className="rounded-xl border border-danger/40 p-4">
              <p className="text-sm font-medium text-danger">Delete community</p>
              <p className="mt-1 text-xs text-muted">Deletes all channels and messages permanently. Type the address ({slug}) to confirm.</p>
              <div className="mt-3 flex gap-2">
                <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Confirm community address" />
                <Button variant="danger" disabled={confirmDelete !== slug} onClick={() => act.mutate(() => api(`/communities/${slug}`, { method: "DELETE" }).then(() => (qc.invalidateQueries({ queryKey: ["communities"] }), navigate("/connect"))))}>
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function InvitePage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["invite", code], queryFn: () => api<CommunitySummary>(`/invites/${code}`), retry: false });
  const accept = useMutation({
    mutationFn: () => api<CommunitySummary>(`/invites/${code}/accept`, { body: {} }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["communities"] });
      navigate(`/connect/c/${c.slug}`);
    },
    onError: (e) => toast.error("Couldn't join", errorMessage(e)),
  });
  return (
    <div className="mx-auto max-w-md pt-10">
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState title="This invite is invalid or has expired" description="Ask for a new link." action={<ButtonLink to="/connect">Browse communities</ButtonLink>} />
      ) : (
        <Panel className="p-6 text-center">
          <p className="text-sm text-faint">You've been invited to join</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">{q.data.name}</h1>
          <p className="mt-1 text-sm text-faint">{q.data.memberCount} members</p>
          {q.data.myRole ? (
            <ButtonLink to={`/connect/c/${q.data.slug}`} variant="primary" className="mt-5">
              Open community
            </ButtonLink>
          ) : (
            <Button variant="primary" className="mt-5" loading={accept.isPending} onClick={() => accept.mutate()}>
              Accept invite
            </Button>
          )}
        </Panel>
      )}
    </div>
  );
}

// Direct messages -------------------------------------------------------------------------

function NewMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [names, setNames] = useState("");
  const [title, setTitle] = useState("");
  const list = names.split(/[\s,]+/).map((n) => n.replace(/^@/, "")).filter(Boolean);
  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/conversations", { body: { usernames: list, title: list.length > 1 ? title || undefined : undefined } }),
    onSuccess: (c) => {
      onClose();
      navigate(`/connect/dm/${c.id}`);
    },
    onError: (e) => toast.error("Can't start conversation", errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title="New message">
      <div className="space-y-4">
        <Field label="To" hint="One or more usernames, separated by spaces or commas (up to 9).">{(id, d) => <Input id={id} aria-describedby={d} value={names} onChange={(e) => setNames(e.target.value)} placeholder="@friend" autoFocus />}</Field>
        {list.length > 1 && <Field label="Group name (optional)">{(id) => <Input id={id} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />}</Field>}
        <p className="text-xs text-faint">People choose who can message them. By default, you can message people who follow you.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!list.length} loading={create.isPending} onClick={() => create.mutate()}>
            Start
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function MessagesPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const q = useQuery({ queryKey: ["conversations"], queryFn: () => api<ConversationView[]>("/conversations"), refetchInterval: 20_000 });
  const conv = q.data?.find((c) => c.id === id);
  const single = useQuery({ queryKey: ["conversation", id], queryFn: () => api<ConversationView>(`/conversations/${id}`), enabled: !!id && !conv });
  const current = conv ?? single.data;
  return (
    <div className="-mx-4 -my-6 grid h-[calc(100dvh-3.5rem)] grid-cols-1 sm:-mx-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={cn("flex-col border-r border-border bg-surface/60", id ? "hidden md:flex" : "flex")}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h1 className="font-display font-semibold">Messages</h1>
          <Button size="sm" variant="primary" onClick={() => setParams({ new: "1" })} aria-label="New message">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {q.isPending ? (
          <Spinner />
        ) : !q.data?.length ? (
          <p className="p-4 text-sm text-faint">No conversations yet.</p>
        ) : (
          <ul className="sx-scroll flex-1 overflow-y-auto p-2">
            {q.data.map((c) => {
              const other = c.members.find((m) => m.id !== me.id) ?? c.members[0]!;
              return (
                <li key={c.id}>
                  <Link to={`/connect/dm/${c.id}`} className={cn("flex items-center gap-3 rounded-lg px-2 py-2", c.id === id ? "bg-accent-soft" : "hover:bg-surface-2")}>
                    {c.kind === "group" ? (
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-3">
                        <Users className="h-4 w-4 text-faint" />
                      </span>
                    ) : (
                      <Avatar user={other} size={36} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", c.unread && "font-semibold")}>{c.title}</span>
                      <span className="block text-xs text-faint">{c.lastMessageAt ? relativeTime(c.lastMessageAt) : "No messages yet"}</span>
                    </span>
                    {c.unread && <span className="h-2 w-2 rounded-full bg-magenta" aria-label="Unread" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className={cn("min-h-0 flex-col", id ? "flex" : "hidden md:flex")}>
        {!id ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Select a conversation" description="Or start a new one — direct or group." action={<Button variant="primary" onClick={() => setParams({ new: "1" })}>New message</Button>} />
          </div>
        ) : single.isError && !conv ? (
          <ErrorState error={single.error} />
        ) : !current ? (
          <Spinner />
        ) : (
          <Chat key={current.id} kind="conversations" id={current.id} title={current.title} />
        )}
      </section>
      <NewMessageDialog open={params.get("new") === "1"} onClose={() => setParams({})} />
    </div>
  );
}
