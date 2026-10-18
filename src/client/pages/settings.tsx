import { useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Monitor, Moon, Sun, Trash2, Upload } from "lucide-react";
import type { UserSummary } from "@shared/types";
import { ACCENTS, BANNERS, LIMITS } from "@shared/schemas";
import { api, errorMessage } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useMe, type MeWithAccent } from "../lib/session";
import { useUploadsEnabled } from "../lib/config";
import { Avatar, Badge, Button, Dialog, Field, Input, PageHeader, Panel, PanelHeader, Select, Spinner, Textarea, Toggle, cn, useToast } from "../components/ui";

const SECTIONS = [
  ["profile", "Profile"],
  ["privacy", "Privacy & safety"],
  ["appearance", "Appearance"],
  ["security", "Security"],
  ["data", "Your data"],
] as const;

function useSave<T>(path: string, ok: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: T) => api<MeWithAccent>(path, { method: "PATCH", body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(ok);
    },
    onError: (e) => toast.error("Couldn't save", errorMessage(e)),
  });
}

const ACCENT_HEX: Record<string, string> = { violet: "#8b5cf6", cyan: "#22d3ee", magenta: "#e879f9", emerald: "#34d399", amber: "#fbbf24" };

function ProfileSection() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadsEnabled = useUploadsEnabled();
  const [form, setForm] = useState({ displayName: me.displayName, bio: me.profile.bio, location: me.profile.location, website: me.profile.website, pronouns: me.profile.pronouns, accent: me.accentName, banner: me.profile.banner });
  const save = useSave<typeof form>("/me/profile", "Profile saved");
  const avatar = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api("/me/avatar", { method: "DELETE" });
      const form = new FormData();
      form.append("file", file);
      return api("/me/avatar", { method: "POST", raw: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => toast.error("Avatar not updated", errorMessage(e)),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Panel>
      <PanelHeader title="Profile" description="How you appear across every SythiX area." />
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Field label="Display name">{(id) => <Input id={id} value={form.displayName} onChange={set("displayName")} maxLength={40} />}</Field>
          <Field label="Bio" hint={`${form.bio.length}/${LIMITS.bio}`}>{(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={form.bio} onChange={set("bio")} maxLength={LIMITS.bio} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location">{(id) => <Input id={id} value={form.location} onChange={set("location")} maxLength={60} />}</Field>
            <Field label="Pronouns">{(id) => <Input id={id} value={form.pronouns} onChange={set("pronouns")} maxLength={30} placeholder="optional" />}</Field>
          </div>
          <Field label="Website" hint="http(s) links only.">{(id, d) => <Input id={id} aria-describedby={d} value={form.website} onChange={set("website")} placeholder="https://" />}</Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Accent colour</legend>
            <div className="flex gap-2">
              {ACCENTS.map((a) => (
                <button key={a} onClick={() => setForm((f) => ({ ...f, accent: a }))} aria-pressed={form.accent === a} aria-label={a} className={cn("h-8 w-8 rounded-full border-2", form.accent === a ? "border-fg" : "border-transparent")} style={{ background: ACCENT_HEX[a] }} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Banner</legend>
            <div className="grid grid-cols-4 gap-2">
              {BANNERS.map((b) => (
                <button key={b} onClick={() => setForm((f) => ({ ...f, banner: b }))} aria-pressed={form.banner === b} aria-label={`${b} banner`} className={cn(`sx-banner-${b}`, "h-12 rounded-lg border-2", form.banner === b ? "border-fg" : "border-transparent")} />
              ))}
            </div>
          </fieldset>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
            Save profile
          </Button>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Avatar</p>
          <Avatar user={me} size={112} className="rounded-2xl" />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" loading={avatar.isPending} disabled={uploadsEnabled === false} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
            {me.avatarUrl && (
              <Button size="sm" variant="ghost" onClick={() => avatar.mutate(null)}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-faint">{uploadsEnabled === false ? "Uploads aren't set up on this installation yet." : "PNG, JPEG, GIF or WebP up to 2 MB."}</p>
        </div>
      </div>
    </Panel>
  );
}

function PrivacySection() {
  const me = useMe();
  const [form, setForm] = useState({ profileVisibility: me.profile.profileVisibility, dmPolicy: me.profile.dmPolicy, allowMentions: me.profile.allowMentions, showActivity: me.profile.showActivity });
  const save = useSave<typeof form>("/me/privacy", "Privacy settings saved");
  const qc = useQueryClient();
  const blocks = useQuery({ queryKey: ["blocks"], queryFn: () => api<UserSummary[]>("/me/blocks") });
  const unblock = useMutation({ mutationFn: (u: string) => api(`/users/${u}/block`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["blocks"] }) });
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Privacy" description="Effective visibility is always the stricter of a post's setting and your profile's." />
        <div className="space-y-4 p-5">
          <Field label="Who can see your profile content" hint="Private hides your posts, media and follow lists from everyone else.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.profileVisibility} onChange={(e) => setForm((f) => ({ ...f, profileVisibility: e.target.value as typeof f.profileVisibility }))}>
                <option value="public">Everyone</option>
                <option value="followers">Followers only</option>
                <option value="private">Only me</option>
              </Select>
            )}
          </Field>
          <Field label="Who can message you">
            {(id) => (
              <Select id={id} value={form.dmPolicy} onChange={(e) => setForm((f) => ({ ...f, dmPolicy: e.target.value as typeof f.dmPolicy }))}>
                <option value="everyone">Everyone</option>
                <option value="followers">People I follow</option>
                <option value="nobody">Nobody</option>
              </Select>
            )}
          </Field>
          <Toggle label="Allow mentions" description="Get notified when people @mention you." checked={form.allowMentions} onChange={(v) => setForm((f) => ({ ...f, allowMentions: v }))} />
          <Toggle label="Show activity" description="Let others see when you're online in rooms you share." checked={form.showActivity} onChange={(v) => setForm((f) => ({ ...f, showActivity: v }))} />
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
            Save privacy
          </Button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Blocked accounts" description="Blocked people can't see your content, follow you or message you — and you won't see theirs." />
        {blocks.isPending ? (
          <Spinner />
        ) : !blocks.data?.length ? (
          <p className="p-5 text-sm text-faint">You haven't blocked anyone.</p>
        ) : (
          <ul className="divide-y divide-border">
            {blocks.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar user={u} size={30} />
                <span className="flex-1 text-sm">@{u.username}</span>
                <Button size="sm" variant="outline" onClick={() => unblock.mutate(u.username)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function AppearanceSection() {
  const me = useMe();
  const save = useSave<MeWithAccent["preferences"]>("/me/preferences", "Appearance saved");
  const set = (patch: Partial<MeWithAccent["preferences"]>) => save.mutate({ ...me.preferences, ...patch });
  return (
    <Panel>
      <PanelHeader title="Appearance" description="Saved to your SythiX ID and applied on every device." />
      <div className="space-y-5 p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Theme</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["dark", "Dark", <Moon key="d" className="h-4 w-4" />],
                ["light", "Light", <Sun key="l" className="h-4 w-4" />],
                ["system", "System", <Monitor key="s" className="h-4 w-4" />],
              ] as const
            ).map(([v, label, icon]) => (
              <button key={v} onClick={() => set({ theme: v })} aria-pressed={me.preferences.theme === v} className={cn("flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm", me.preferences.theme === v ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
                {icon} {label}
              </button>
            ))}
          </div>
        </fieldset>
        <Toggle label="Reduce motion" description="Turns off animations and transitions. Your system setting is also respected." checked={me.preferences.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        <Toggle label="Collapse navigation" description="Start with the icon-only navigation rail (Ctrl+B toggles)." checked={me.preferences.navCollapsed} onChange={(v) => set({ navCollapsed: v })} />
        <p className="text-xs text-faint">Customize Home widgets from the Customize button on Home.</p>
      </div>
    </Panel>
  );
}

function SecuritySection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const change = useMutation({
    mutationFn: () => api("/me/password", { body: pw }),
    onSuccess: () => {
      setPw({ currentPassword: "", newPassword: "" });
      toast.success("Password changed", "Other sessions were signed out.");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error("Password not changed", errorMessage(e)),
  });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ id: string; ip: string | null; userAgent: string | null; lastSeenAt: number; current: boolean }[]>("/me/sessions") });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/me/sessions/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Change password" description="Changing it signs you out everywhere else." />
        <div className="max-w-md space-y-4 p-5">
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />}</Field>
          <Field label="New password" hint="At least 10 characters.">{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />}</Field>
          <Button variant="primary" loading={change.isPending} disabled={!pw.currentPassword || pw.newPassword.length < 10} onClick={() => change.mutate()}>
            Change password
          </Button>
          <p className="text-xs text-faint">Passkeys and two-factor authentication are planned for a later milestone.</p>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Active sessions" />
        {sessions.isPending ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.data?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.userAgent ?? "Unknown device"}</p>
                  <p className="text-xs text-faint">
                    {s.ip ?? "unknown IP"} · active {relativeTime(s.lastSeenAt)}
                  </p>
                </div>
                {s.current ? (
                  <Badge tone="success">This device</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function DataSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const del = useMutation({
    mutationFn: () => api("/me/delete", { body: { password, confirm } }),
    onSuccess: () => {
      qc.clear();
      navigate("/login");
    },
    onError: (e) => toast.error("Account not deleted", errorMessage(e)),
  });
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Export your data" description="A JSON file with your account, profile, posts, comments, reactions, follows, communities and messages." />
        <div className="p-5">
          <a href="/api/me/export" download className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">
            <Download className="h-4 w-4" /> Download my data
          </a>
        </div>
      </Panel>
      <Panel className="border-danger/40">
        <PanelHeader title="Delete account" description="Permanently deletes your SythiX ID, posts, media, comments, reactions and messages. This cannot be undone." />
        <div className="p-5">
          <Button variant="danger" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete my account
          </Button>
        </div>
      </Panel>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <div className="space-y-4">
          <p className="text-sm text-muted">Download your data first if you want a copy. Communities you own must be deleted or transferred first.</p>
          <Field label="Password">{(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label='Type "DELETE" to confirm'>{(id) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirm !== "DELETE" || !password} loading={del.isPending} onClick={() => del.mutate()}>
              Delete forever
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export function SettingsPage() {
  const { section = "profile" } = useParams();
  const body = { profile: <ProfileSection />, privacy: <PrivacySection />, appearance: <AppearanceSection />, security: <SecuritySection />, data: <DataSection /> }[section] ?? <ProfileSection />;
  return (
    <div>
      <PageHeader eyebrow="SythiX ID" title="Settings" description="One account, one set of preferences for all of SythiX Unite." />
      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col">
          {SECTIONS.map(([id, label]) => (
            <NavLink key={id} to={id === "profile" ? "/settings" : `/settings/${id}`} end className={({ isActive }) => cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", isActive ? "bg-accent-soft font-medium" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
    </div>
  );
}
