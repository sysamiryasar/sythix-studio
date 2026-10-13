"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Select, Switch, Textarea, Input } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { ProfileRow } from "@/modules/nexusid/profiles";
import { BANNERS, ProfileBanner } from "./profile-card";
import { CosmeticPreview } from "./cosmetic-preview";

export function ProfileEditor({
  user,
  initial,
  minecraft,
  loadout,
}: {
  user: { username: string; displayName: string };
  initial: ProfileRow;
  minecraft: { name: string; uuid: string } | null;
  loadout: { category: string; preview_style: string }[];
}) {
  const toast = useToast();
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const toggle = (k: "show_stats" | "show_achievements" | "show_servers" | "show_creations" | "allow_friend_requests", label: string, hint: string) => (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-faint">{hint}</div>
      </div>
      <Switch label={label} checked={p[k] === 1} onChange={(v) => setP({ ...p, [k]: v ? 1 : 0 })} />
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <ProfileBanner
          displayName={user.displayName}
          username={user.username}
          bannerStyle={p.banner_style}
          accent={p.accent_color}
          minecraft={minecraft}
          avatarSource={p.avatar_source}
          bio={p.bio}
          actions={
            <Link href={`/u/${user.username}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              View public profile <ExternalLink className="h-3 w-3" />
            </Link>
          }
        />
        <Panel>
          <PanelHeader title="Appearance" />
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Bio" hint={`${p.bio.length}/280`} className="sm:col-span-2">
              {(f) => <Textarea {...f} maxLength={280} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} placeholder="Builder, redstoner, server admin…" />}
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-xs font-medium text-muted">Banner</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {Object.entries(BANNERS).map(([k, b]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={p.banner_style === k}
                    onClick={() => setP({ ...p, banner_style: k as ProfileRow["banner_style"] })}
                    className={cn("h-12 rounded-md border text-[10px] font-medium text-white/90", b.className, p.banner_style === k ? "border-accent ring-2 ring-accent/40" : "border-border")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Accent colour">
              {(f) => (
                <div className="flex gap-2">
                  <input type="color" aria-label="Pick accent colour" value={p.accent_color} onChange={(e) => setP({ ...p, accent_color: e.target.value })} className="h-9 w-12 rounded border border-border bg-surface-2" />
                  <Input {...f} value={p.accent_color} onChange={(e) => setP({ ...p, accent_color: e.target.value })} className="font-mono" />
                </div>
              )}
            </Field>
            <Field label="Avatar" hint={minecraft ? undefined : "Link a Minecraft account in Settings to use your skin."}>
              {(f) => (
                <Select {...f} value={p.avatar_source} onChange={(e) => setP({ ...p, avatar_source: e.target.value as "initials" | "minecraft" })}>
                  <option value="initials">Initials</option>
                  <option value="minecraft" disabled={!minecraft}>
                    Minecraft skin (verified)
                  </option>
                </Select>
              )}
            </Field>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Privacy" description="Enforced on the server for every viewer, including signed-out visitors." />
          <PanelBody className="space-y-4">
            <Field label="Who can see your profile">
              {(f) => (
                <Select {...f} value={p.visibility} onChange={(e) => setP({ ...p, visibility: e.target.value as ProfileRow["visibility"] })}>
                  <option value="public">Everyone</option>
                  <option value="friends">Friends only</option>
                  <option value="private">Only me</option>
                </Select>
              )}
            </Field>
            {toggle("show_stats", "Show statistics", "Achievement points, friends, public creations.")}
            {toggle("show_achievements", "Show achievements", "Your showcase and recent unlocks.")}
            {toggle("show_creations", "Show public creations", "ForgeOS projects you've marked public.")}
            {toggle("show_servers", "Show servers you administer", "Server names, software and version only.")}
            {toggle("allow_friend_requests", "Allow friend requests", "Others can still find your public profile.")}
          </PanelBody>
        </Panel>
        <div className="sticky bottom-4 flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api("/api/v1/nexus/profile", {
                  method: "PATCH",
                  body: {
                    bio: p.bio,
                    bannerStyle: p.banner_style,
                    accentColor: p.accent_color,
                    avatarSource: p.avatar_source,
                    visibility: p.visibility,
                    showStats: p.show_stats === 1,
                    showAchievements: p.show_achievements === 1,
                    showServers: p.show_servers === 1,
                    showCreations: p.show_creations === 1,
                    allowFriendRequests: p.allow_friend_requests === 1,
                  },
                });
                toast.success("Profile saved");
                setSaved(p);
              } catch (e) {
                toast.error("Profile not saved", (e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Save profile
          </Button>
        </div>
      </div>
      <Panel className="h-fit xl:sticky xl:top-16">
        <PanelHeader title="Cosmetic preview" description="Website preview only — not shown in vanilla Minecraft." />
        <PanelBody className="sx-voxel-grid flex justify-center">
          <CosmeticPreview loadout={loadout} />
        </PanelBody>
        <div className="border-t border-border px-4 py-2 text-center">
          <Link href="/nexus/cosmetics" className="text-xs text-accent hover:underline">
            Change cosmetics
          </Link>
        </div>
      </Panel>
    </div>
  );
}
