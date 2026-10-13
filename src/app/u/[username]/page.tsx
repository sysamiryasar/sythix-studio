import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Trophy } from "lucide-react";
import { getCurrentUser, getServerContext } from "@/lib/auth/current";
import { getPublicProfile } from "@/modules/nexusid/profiles";
import { isModuleAvailable } from "@/modules/service";
import { ProfileBanner } from "@/components/nexus/profile-card";
import { CosmeticPreview } from "@/components/nexus/cosmetic-preview";
import { ProfileActions } from "@/components/nexus/profile-actions";
import { Panel, PanelBody, PanelHeader, Stat } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/shell/logo";
import { formatDateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}`, robots: { index: false } };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const ctx = await getServerContext();
  if (!(await isModuleAvailable(ctx, "nexusid"))) notFound();
  const viewer = await getCurrentUser();
  const p = await getPublicProfile(ctx, viewer, decodeURIComponent(username));
  if (!p) notFound();

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <Link href="/">
          <Wordmark />
        </Link>
        {viewer ? (
          <Link href="/" className="text-xs text-muted hover:text-fg">
            Back to Studio
          </Link>
        ) : (
          <Link href="/login" className="text-xs text-accent hover:underline">
            Sign in
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {p.state !== "visible" ? (
          <Panel>
            <PanelBody className="flex flex-col items-center py-12 text-center">
              <Lock className="h-6 w-6 text-faint" />
              <h1 className="mt-3 text-lg font-semibold">@{p.user.username}</h1>
              <p className="mt-1 text-sm text-muted">{p.state === "private" ? "This profile is private." : "Only friends can see this profile."}</p>
              {viewer && !p.isSelf && (
                <div className="mt-4">
                  <ProfileActions targetId={p.user.id} username={p.user.username} relationship={p.relationship} />
                </div>
              )}
            </PanelBody>
          </Panel>
        ) : (
          <>
            <ProfileBanner
              displayName={p.user.display_name}
              username={p.user.username}
              bannerStyle={p.profile!.banner_style}
              accent={p.profile!.accent_color}
              minecraft={p.minecraft}
              avatarSource={p.profile!.avatar_source}
              bio={p.profile!.bio}
              badges={p.isSelf && p.profile!.visibility !== "public" ? <Badge>Visible to {p.profile!.visibility === "friends" ? "friends" : "you only"}</Badge> : undefined}
              actions={viewer && !p.isSelf ? <ProfileActions targetId={p.user.id} username={p.user.username} relationship={p.relationship} /> : undefined}
            />
            {p.stats && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Achievements" value={p.stats.achievements} />
                <Stat label="Points" value={p.stats.points} />
                <Stat label="Friends" value={p.stats.friends} />
                <Stat label="Public creations" value={p.stats.publicCreations} />
                <Stat label="Teams" value={p.stats.teams} />
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <div className="space-y-6">
                {p.achievements && (
                  <Panel>
                    <PanelHeader title="Achievements" />
                    <PanelBody className="grid gap-2 sm:grid-cols-2">
                      {p.achievements.length === 0 && <p className="text-sm text-muted">No achievements yet.</p>}
                      {p.achievements.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
                          <Trophy className="h-4 w-4 text-accent" />
                          <div>
                            <div className="text-sm">{a.name}</div>
                            <div className="text-[11px] text-faint">{a.description}</div>
                          </div>
                        </div>
                      ))}
                    </PanelBody>
                  </Panel>
                )}
                {p.creations && (
                  <Panel>
                    <PanelHeader title="Public creations" description="ForgeOS projects published by this creator." />
                    <PanelBody className="grid gap-2 sm:grid-cols-2">
                      {p.creations.length === 0 && <p className="text-sm text-muted">No public creations yet.</p>}
                      {p.creations.map((c) => (
                        <div key={c.id} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="line-clamp-2 text-xs text-muted">{c.description || "No description."}</div>
                          <Badge className="mt-2">Java {c.target_version}</Badge>
                        </div>
                      ))}
                    </PanelBody>
                  </Panel>
                )}
                {p.servers && p.servers.length > 0 && (
                  <Panel>
                    <PanelHeader title="Servers" />
                    <ul className="divide-y divide-border text-sm">
                      {p.servers.map((s, i) => (
                        <li key={i} className="flex justify-between px-4 py-2">
                          {s.name}
                          <span className="text-xs text-faint">
                            {s.software} {s.mc_version}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
              <div className="space-y-6">
                <Panel>
                  <PanelHeader title="Cosmetics" description="Website preview only." />
                  <PanelBody className="sx-voxel-grid flex justify-center">
                    <CosmeticPreview loadout={p.loadout ?? []} size={140} />
                  </PanelBody>
                </Panel>
                {p.teams && p.teams.length > 0 && (
                  <Panel>
                    <PanelHeader title="Teams" />
                    <PanelBody className="flex flex-wrap gap-1.5">
                      {p.teams.map((t) => (
                        <Badge key={t.slug}>{t.name}</Badge>
                      ))}
                    </PanelBody>
                  </Panel>
                )}
                <p className="text-center text-xs text-faint">Member since {formatDateTime(p.user.created_at).slice(0, 10)}</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
