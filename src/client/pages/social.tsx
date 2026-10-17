import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, CalendarDays, CheckCheck, Globe2, Hash, Link2, MapPin, ShieldOff, UserPlus, Users } from "lucide-react";
import type { NotificationView, PostView, ProfileView, SearchResults, UserSummary } from "@shared/types";
import { api, errorMessage } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useMe } from "../lib/session";
import { Avatar, Badge, Button, ButtonLink, Dialog, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Spinner, Tabs, cn, useToast } from "../components/ui";
import { Comments, Composer, PostCard, PostList, ReportDialog } from "../components/social";

function TrendingAside() {
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => api<{ tag: string; count: number }[]>("/tags/trending") });
  const suggestions = useQuery({ queryKey: ["suggestions"], queryFn: () => api<UserSummary[]>("/suggestions") });
  return (
    <aside className="hidden space-y-5 lg:block">
      <Panel>
        <PanelHeader title="Trending" icon={<Hash className="h-4 w-4" />} />
        {trending.data?.length ? (
          <ol className="p-2">
            {trending.data.slice(0, 8).map((t) => (
              <li key={t.tag}>
                <Link to={`/social/tag/${encodeURIComponent(t.tag)}`} className="flex justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  <span className="font-medium">#{t.tag}</span>
                  <span className="text-xs text-faint">{t.count}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-4 text-xs text-faint">{trending.isPending ? "Loading…" : "No public tags in the last 3 days."}</p>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Who to follow" icon={<UserPlus className="h-4 w-4" />} />
        {suggestions.data?.length ? (
          <ul className="p-2">
            {suggestions.data.map((u) => (
              <li key={u.id}>
                <SuggestionRow user={u} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-xs text-faint">{suggestions.isPending ? "Loading…" : "No suggestions right now."}</p>
        )}
      </Panel>
    </aside>
  );
}

function SuggestionRow({ user }: { user: UserSummary }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const follow = useMutation({
    mutationFn: () => api(`/users/${user.username}/follow`, { body: {} }),
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => toast.error("Couldn't follow", errorMessage(e)),
  });
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <Link to={`/u/${user.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar user={user} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{user.displayName}</span>
          <span className="block truncate text-xs text-faint">@{user.username}</span>
        </span>
      </Link>
      <Button size="sm" variant={done ? "ghost" : "outline"} disabled={done} loading={follow.isPending} onClick={() => follow.mutate()}>
        {done ? "Following" : "Follow"}
      </Button>
    </div>
  );
}

export function SocialFeedPage() {
  const [params, setParams] = useSearchParams();
  const tab = (["home", "following", "discover"].includes(params.get("tab") ?? "") ? params.get("tab") : "home") as "home" | "following" | "discover";
  const empty = {
    home: { title: "Your home feed is quiet", description: "Post something, or follow people to see their updates here.", action: <ButtonLink to="/social?tab=discover" variant="primary" size="sm">Discover posts</ButtonLink> },
    following: { title: "Nothing from people you follow yet", description: "Follow creators and friends to fill this feed." },
    discover: { title: "Nothing to recommend yet", description: "Recommendations are public posts from the last 7 days by people you don't follow." },
  }[tab];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <PageHeader eyebrow="SythiX Social" title="Feed" />
        <Tabs
          label="Feeds"
          value={tab}
          onChange={(v) => setParams({ tab: v })}
          items={[
            { value: "home", label: "Home" },
            { value: "following", label: "Following" },
            { value: "discover", label: "Discover" },
          ]}
        />
        <Panel>
          <Composer autoFocus={params.get("compose") === "1"} />
        </Panel>
        <Panel>
          <PostList key={tab} queryKey={["feed", tab]} path={`/feed?tab=${tab}`} empty={empty} />
        </Panel>
        {tab === "discover" && <p className="text-center text-xs text-faint">How Discover ranks posts: public posts from the last 7 days by people you don't follow, scored by reactions, comments and reposts with time decay.</p>}
      </div>
      <TrendingAside />
    </div>
  );
}

export function ExplorePage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <PageHeader eyebrow="SythiX Social" title="Explore" description="Recommended public posts, trending tags and people to follow." />
        <div className="lg:hidden">
          <TrendingAside />
        </div>
        <Panel>
          <PostList queryKey={["feed", "discover"]} path="/feed?tab=discover" empty={{ title: "Nothing to explore yet", description: "Be the first to post something public." }} />
        </Panel>
      </div>
      <TrendingAside />
    </div>
  );
}

export function PostPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["posts", "post", id], queryFn: () => api<PostView>(`/posts/${id}`) });
  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => (history.length > 1 ? navigate(-1) : navigate("/social"))} className="mb-3 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <Panel>
          <PostCard post={q.data} detail />
          <Comments postId={q.data.repostOf?.id ?? q.data.id} />
        </Panel>
      )}
    </div>
  );
}

export function TagPage() {
  const { tag = "" } = useParams();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader eyebrow="Tag" title={`#${tag}`} description="Posts you can see that use this tag, newest first." />
      <Panel>
        <PostList queryKey={["tag", tag]} path={`/tags/${encodeURIComponent(tag)}`} empty={{ title: `No visible posts with #${tag}` }} />
      </Panel>
    </div>
  );
}

export function BookmarksPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader eyebrow="SythiX Social" title="Bookmarks" description="Only you can see what you've bookmarked." />
      <Panel>
        <PostList queryKey={["bookmarks"]} path="/bookmarks" empty={{ title: "No bookmarks yet", description: "Tap the bookmark icon on any post to save it here." }} />
      </Panel>
    </div>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const r = useQuery({ queryKey: ["search", q], queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(q)}`), enabled: q.trim().length >= 2 });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Search: “${q}”`} description="Results only include things you're allowed to see." />
      {q.trim().length < 2 ? (
        <EmptyState title="Type at least 2 characters" description="Press Ctrl/⌘+K to search from anywhere." />
      ) : r.isPending ? (
        <Spinner />
      ) : r.isError ? (
        <ErrorState error={r.error} retry={() => r.refetch()} />
      ) : (
        <>
          <Panel>
            <PanelHeader title={`People (${r.data.users.length})`} />
            {r.data.users.length ? (
              <ul className="grid gap-1 p-2 sm:grid-cols-2">
                {r.data.users.map((u) => (
                  <li key={u.id}>
                    <SuggestionRow user={u} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-faint">No people found.</p>
            )}
          </Panel>
          <Panel>
            <PanelHeader title={`Communities (${r.data.communities.length})`} />
            {r.data.communities.length ? (
              <ul className="p-2">
                {r.data.communities.map((c) => (
                  <li key={c.id}>
                    <Link to={`/connect/c/${c.slug}`} className="flex justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-faint">{c.memberCount} members</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-faint">No communities found.</p>
            )}
          </Panel>
          {r.data.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.data.tags.map((t) => (
                <Link key={t.tag} to={`/social/tag/${encodeURIComponent(t.tag)}`}>
                  <Badge tone="accent">
                    #{t.tag} · {t.count}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          <Panel>
            <PanelHeader title={`Posts (${r.data.posts.length})`} />
            {r.data.posts.length ? (
              <ul className="divide-y divide-border">
                {r.data.posts.map((p) => (
                  <li key={p.id}>
                    <PostCard post={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-faint">No posts found.</p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

// Profile -----------------------------------------------------------------------------

function FollowListDialog({ username, which, onClose }: { username: string; which: "followers" | "following" | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["follows", username, which], queryFn: () => api<UserSummary[]>(`/users/${username}/${which}`), enabled: !!which });
  return (
    <Dialog open={!!which} onClose={onClose} title={which === "followers" ? "Followers" : "Following"}>
      {q.isPending ? (
        <Spinner />
      ) : !q.data?.length ? (
        <p className="py-6 text-center text-sm text-faint">Nobody here yet.</p>
      ) : (
        <ul className="sx-scroll max-h-96 overflow-y-auto">
          {q.data.map((u) => (
            <li key={u.id}>
              <Link to={`/u/${u.username}`} onClick={onClose} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Avatar user={u} size={32} />
                <span>
                  <span className="block text-sm font-medium">{u.displayName}</span>
                  <span className="block text-xs text-faint">@{u.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function ProfilePage() {
  const { username = "" } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const [reporting, setReporting] = useState(false);
  const q = useQuery({ queryKey: ["profile", username.toLowerCase()], queryFn: () => api<ProfileView>(`/users/${encodeURIComponent(username)}`) });

  const act = useMutation({
    mutationFn: ({ path, method }: { path: string; method: string }) => api(`/users/${username}/${path}`, { method, body: method === "DELETE" ? undefined : {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile", username.toLowerCase()] });
      void qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => toast.error("That didn't work", errorMessage(e)),
  });
  const message = useMutation({
    mutationFn: () => api<{ id: string }>("/conversations", { body: { usernames: [username] } }),
    onSuccess: (c) => navigate(`/connect/dm/${c.id}`),
    onError: (e) => toast.error("Can't message", errorMessage(e)),
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} />;
  const p = q.data;
  const rel = p.relationship;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel className="overflow-hidden">
        <div className={cn("h-36 sm:h-44", `sx-banner-${p.banner}`)} aria-hidden />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <Avatar user={p} size={96} className="rounded-2xl border-4 border-surface" />
            <div className="flex flex-wrap justify-end gap-2 pb-1">
              {rel.isSelf ? (
                <ButtonLink to="/settings" variant="outline" size="sm">
                  Edit profile
                </ButtonLink>
              ) : rel.blocked ? (
                <Button size="sm" variant="outline" loading={act.isPending} onClick={() => act.mutate({ path: "block", method: "DELETE" })}>
                  Unblock
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" loading={message.isPending} onClick={() => message.mutate()}>
                    Message
                  </Button>
                  <Button size="sm" variant={rel.following ? "outline" : "primary"} loading={act.isPending} onClick={() => act.mutate({ path: "follow", method: rel.following ? "DELETE" : "POST" })}>
                    {rel.following ? "Following" : rel.followsYou ? "Follow back" : "Follow"}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mt-3">
            <h1 className="font-display text-2xl font-semibold">{p.displayName}</h1>
            <p className="text-sm text-faint">
              @{p.username}
              {p.pronouns && <span> · {p.pronouns}</span>}
              {rel.followsYou && !rel.isSelf && (
                <Badge className="ml-2" tone="default">
                  Follows you
                </Badge>
              )}
            </p>
            {p.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-faint">
              {p.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {p.location}
                </span>
              )}
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-cyan hover:underline">
                  <Link2 className="h-3.5 w-3.5" />
                  {p.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Joined {new Date(p.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <button onClick={() => p.canViewContent && setList("following")} className="hover:underline">
                <b className="tabular-nums">{p.counts.following}</b> <span className="text-faint">Following</span>
              </button>
              <button onClick={() => p.canViewContent && setList("followers")} className="hover:underline">
                <b className="tabular-nums">{p.counts.followers}</b> <span className="text-faint">Followers</span>
              </button>
              <span>
                <b className="tabular-nums">{p.counts.posts}</b> <span className="text-faint">Posts</span>
              </span>
            </div>
            {!rel.isSelf && (
              <div className="mt-3 flex gap-3 text-xs text-faint">
                {!rel.blocked && (
                  <button className="flex items-center gap-1 hover:text-danger" onClick={() => act.mutate({ path: "block", method: "POST" })}>
                    <ShieldOff className="h-3.5 w-3.5" /> Block
                  </button>
                )}
                <button className="hover:text-fg" onClick={() => setReporting(true)}>
                  Report
                </button>
              </div>
            )}
          </div>
        </div>
      </Panel>
      {!p.canViewContent ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={rel.blocked ? "You've blocked this account" : "This profile is private"}
          description={rel.blocked ? "Unblock to see their posts." : "Follow this account to see their posts, if they allow followers."}
        />
      ) : (
        <>
          <Tabs label="Profile sections" value={tab} onChange={setTab} items={[{ value: "posts", label: "Posts" }, { value: "media", label: "Media" }]} />
          <Panel>
            <PostList
              key={`${p.id}-${tab}`}
              queryKey={["user", p.id, tab]}
              path={`/users/${p.username}/posts?kind=${tab}`}
              empty={{ title: tab === "media" ? "No photos or videos yet" : rel.isSelf ? "You haven't posted yet" : "No posts yet" }}
            />
          </Panel>
        </>
      )}
      <FollowListDialog username={p.username} which={list} onClose={() => setList(null)} />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={p.id} />
      {rel.isSelf && me.profile.profileVisibility !== "public" && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
          <Globe2 className="h-3.5 w-3.5" /> Your profile is {me.profile.profileVisibility === "private" ? "private" : "visible to followers only"}. Change this in Settings → Privacy.
        </p>
      )}
    </div>
  );
}

// Notifications -------------------------------------------------------------------------

export function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: NotificationView[]; unread: number }>("/notifications") });
  const read = useMutation({
    mutationFn: (ids: string[] | "all") => api("/notifications/read", { body: { ids } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["unread"] });
    },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Notifications"
        description="Follows, reactions, comments, mentions, reposts and messages."
        actions={
          q.data?.unread ? (
            <Button size="sm" variant="outline" onClick={() => read.mutate("all")} loading={read.isPending}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : null
        }
      />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" description="New activity shows up here in real time." />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {q.data.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.readAt) read.mutate([n.id]);
                    if (n.link) navigate(n.link);
                  }}
                  className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}
                >
                  {n.actor ? <Avatar user={n.actor} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-3"><Bell className="h-4 w-4 text-faint" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-sm text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-faint">{relativeTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-magenta" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
