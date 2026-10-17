import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bell, Compass, Eye, EyeOff, Hash, LayoutGrid, PenSquare, Sparkles, Users, X } from "lucide-react";
import type { CommunitySummary, NotificationView, Page, PostView } from "@shared/types";
import { PRODUCT_AREAS } from "@shared/areas";
import type { DashboardWidget } from "@shared/schemas";
import { api, errorMessage } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useMe } from "../lib/session";
import { Badge, Button, ButtonLink, Dialog, Panel, PanelHeader, Spinner, cn, useToast } from "../components/ui";
import { Composer, PostCard } from "../components/social";

const WIDGET_LABEL: Record<DashboardWidget, string> = {
  compose: "Quick post",
  feed: "Latest from your feed",
  communities: "Your communities",
  notifications: "Recent notifications",
  trending: "Trending tags",
  areas: "SythiX ecosystem",
};

function FeedWidget() {
  const q = useQuery({ queryKey: ["posts", "dash-feed"], queryFn: () => api<Page<PostView>>("/feed?tab=home") });
  const items = q.data?.items.slice(0, 4) ?? [];
  return (
    <Panel>
      <PanelHeader title="Latest from your feed" icon={<Compass className="h-4 w-4" />} actions={<ButtonLink to="/social" size="sm" variant="ghost">Open feed</ButtonLink>} />
      {q.isPending ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          Your feed is empty. <Link to="/social/explore" className="text-accent hover:underline">Discover people to follow</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CommunitiesWidget() {
  const q = useQuery({ queryKey: ["communities"], queryFn: () => api<{ mine: CommunitySummary[]; discover: CommunitySummary[] }>("/communities") });
  const mine = q.data?.mine ?? [];
  return (
    <Panel>
      <PanelHeader title="Your communities" icon={<Users className="h-4 w-4" />} actions={<ButtonLink to="/connect" size="sm" variant="ghost">All</ButtonLink>} />
      {q.isPending ? (
        <Spinner />
      ) : mine.length === 0 ? (
        <div className="p-5 text-sm text-muted">
          You haven't joined any communities yet.
          <div className="mt-3 flex gap-2">
            <ButtonLink to="/connect?create=1" size="sm" variant="primary">Create one</ButtonLink>
            <ButtonLink to="/connect" size="sm" variant="outline">Browse</ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="p-2">
          {mine.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link to={`/connect/c/${c.slug}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft font-display text-sm font-semibold text-accent">{c.name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-faint">{c.memberCount} members</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NotificationsWidget() {
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: NotificationView[]; unread: number }>("/notifications") });
  const items = q.data?.items.slice(0, 5) ?? [];
  return (
    <Panel>
      <PanelHeader title="Recent notifications" icon={<Bell className="h-4 w-4" />} actions={<ButtonLink to="/notifications" size="sm" variant="ghost">All</ButtonLink>} />
      {q.isPending ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="p-5 text-sm text-muted">Nothing yet. Follows, reactions, replies and messages show up here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={n.link ?? "/notifications"} className={cn("block px-4 py-2.5 text-sm hover:bg-surface-2", !n.readAt && "font-medium")}>
                {n.title}
                <span className="block text-xs font-normal text-faint">{relativeTime(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TrendingWidget() {
  const q = useQuery({ queryKey: ["trending"], queryFn: () => api<{ tag: string; count: number }[]>("/tags/trending") });
  return (
    <Panel>
      <PanelHeader title="Trending" description="Public tags, last 3 days" icon={<Hash className="h-4 w-4" />} />
      {q.isPending ? (
        <Spinner />
      ) : !q.data?.length ? (
        <p className="p-5 text-sm text-muted">No trends yet. Add a #tag to your next post.</p>
      ) : (
        <ol className="p-2">
          {q.data.map((t, i) => (
            <li key={t.tag}>
              <Link to={`/social/tag/${encodeURIComponent(t.tag)}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className="w-4 text-xs tabular-nums text-faint">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-medium">#{t.tag}</span>
                <span className="text-xs text-faint">{t.count} posts</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function AreasWidget() {
  return (
    <Panel>
      <PanelHeader title="SythiX ecosystem" description="What works today, and what's coming" icon={<Sparkles className="h-4 w-4" />} />
      <ul className="grid gap-2 p-3 sm:grid-cols-2">
        {PRODUCT_AREAS.map((a) => (
          <li key={a.id}>
            <Link to={a.href} className="block h-full rounded-xl border border-border bg-surface-2/60 p-3 transition-colors hover:border-accent/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{a.name}</span>
                <Badge tone={a.status === "live" ? "success" : a.status === "partial" ? "cyan" : a.status === "needs-infra" ? "warning" : "default"}>
                  {a.status === "live" ? "Live" : a.status === "partial" ? "Beta" : a.status === "needs-infra" ? "Needs infrastructure" : `Milestone ${a.milestone}`}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-faint">{a.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CustomizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [layout, setLayout] = useState(me.preferences.dashboard);
  const save = useMutation({
    mutationFn: () => api("/me/preferences", { method: "PATCH", body: { ...me.preferences, dashboard: layout } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Home layout saved");
      onClose();
    },
    onError: (e) => toast.error("Couldn't save", errorMessage(e)),
  });
  const move = (i: number, d: -1 | 1) =>
    setLayout((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  return (
    <Dialog open={open} onClose={onClose} title="Customize Home">
      <p className="mb-3 text-sm text-muted">Show, hide and reorder the widgets on your Home dashboard. Saved to your SythiX ID.</p>
      <ul className="space-y-1.5">
        {layout.map((w, i) => (
          <li key={w.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <span className={cn("flex-1 text-sm", !w.visible && "text-faint line-through")}>{WIDGET_LABEL[w.id]}</span>
            <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${WIDGET_LABEL[w.id]} up`}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === layout.length - 1} aria-label={`Move ${WIDGET_LABEL[w.id]} down`}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setLayout((l) => l.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)))} aria-label={w.visible ? `Hide ${WIDGET_LABEL[w.id]}` : `Show ${WIDGET_LABEL[w.id]}`}>
              {w.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save layout
        </Button>
      </div>
    </Dialog>
  );
}

export function HomePage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [customizing, setCustomizing] = useState(false);
  const welcome = params.get("welcome");
  const visible = me.preferences.dashboard.filter((w) => w.visible).map((w) => w.id);
  const hour = new Date().getHours();
  const greet = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const widget = (id: DashboardWidget) => {
    switch (id) {
      case "compose":
        return (
          <Panel key={id}>
            <PanelHeader title="Quick post" icon={<PenSquare className="h-4 w-4" />} />
            <Composer compact />
          </Panel>
        );
      case "feed":
        return <FeedWidget key={id} />;
      case "communities":
        return <CommunitiesWidget key={id} />;
      case "notifications":
        return <NotificationsWidget key={id} />;
      case "trending":
        return <TrendingWidget key={id} />;
      case "areas":
        return <AreasWidget key={id} />;
    }
  };
  const main: DashboardWidget[] = ["compose", "feed", "areas"];
  return (
    <div>
      {welcome && (
        <div className="sx-in relative mb-5 overflow-hidden rounded-2xl border border-accent/40 p-5" role="status">
          <div className="sx-banner-aurora absolute inset-0 opacity-25" aria-hidden />
          <button onClick={() => setParams({})} className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:text-fg" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
          <p className="relative font-display text-lg font-semibold">Welcome to SythiX Unite, {me.displayName}!</p>
          <p className="relative mt-1 text-sm text-muted">
            {welcome === "owner"
              ? "You created the first account, so you're the platform owner: you can moderate content and manage roles from Moderation."
              : "Set up your profile, follow a few people, and join a community to get started."}
          </p>
          <div className="relative mt-3 flex flex-wrap gap-2">
            <ButtonLink to="/settings" size="sm" variant="primary">Edit profile</ButtonLink>
            <ButtonLink to="/social/explore" size="sm" variant="outline">Find people</ButtonLink>
            <ButtonLink to="/connect" size="sm" variant="outline">Join communities</ButtonLink>
          </div>
        </div>
      )}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-faint">{greet},</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{me.displayName}</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCustomizing(true)}>
          <LayoutGrid className="h-4 w-4" /> Customize
        </Button>
      </header>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">All widgets are hidden. Use Customize to bring some back.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">{visible.filter((w) => main.includes(w)).map(widget)}</div>
          <div className="space-y-5">{visible.filter((w) => !main.includes(w)).map(widget)}</div>
        </div>
      )}
      <CustomizeDialog key={String(customizing)} open={customizing} onClose={() => setCustomizing(false)} />
    </div>
  );
}
