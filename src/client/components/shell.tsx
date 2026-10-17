import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, Compass, Gamepad2, Home, LogOut, Menu, MessageSquare, MessagesSquare, PanelLeftClose, PanelLeftOpen, Puzzle, Search, Server, Settings, ShieldCheck, Sparkles, Box, Users, Wand2, X, Scroll, Globe2 } from "lucide-react";
import { PRODUCT_AREAS, type AreaStatus } from "@shared/areas";
import { platformCan } from "@shared/permissions";
import { api } from "../lib/api";
import { useMe } from "../lib/session";
import { useRoom } from "../lib/realtime";
import { Avatar, cn } from "./ui";
import { Wordmark, SythixMark } from "./logo";
import { CommandPalette } from "./command-palette";

const AREA_ICON: Record<string, ReactNode> = {
  minecraft: <Box className="h-4 w-4" />,
  hosting: <Server className="h-4 w-4" />,
  studio: <Wand2 className="h-4 w-4" />,
  gaming: <Gamepad2 className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
  worlds: <Globe2 className="h-4 w-4" />,
  extensions: <Puzzle className="h-4 w-4" />,
};

const STATUS_LABEL: Record<AreaStatus, string> = { live: "Live", partial: "Beta", planned: "Soon", "needs-infra": "Infra" };

function useUnread() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["unread"], queryFn: () => api<{ unread: number }>("/notifications/unread"), refetchInterval: 60_000 });
  useRoom(`user:${me.id}`, (e) => {
    if (e.type === "notification") {
      qc.setQueryData(["unread"], { unread: e.unread });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
  return q.data?.unread ?? 0;
}

function NavItem({ to, icon, label, collapsed, end, badge, onNavigate }: { to: string; icon: ReactNode; label: string; collapsed: boolean; end?: boolean; badge?: ReactNode; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
          isActive ? "bg-accent-soft font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-2 h-5 w-0.5 rounded-full bg-accent" aria-hidden />}
          <span className={cn("shrink-0", isActive ? "text-accent" : "text-faint group-hover:text-muted")}>{icon}</span>
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {!collapsed && badge}
        </>
      )}
    </NavLink>
  );
}

function Nav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const me = useMe();
  const unread = useUnread();
  const section = (label: string) => !collapsed && <div className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>;
  return (
    <nav aria-label="Primary" className="sx-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      <NavItem to="/" end icon={<Home className="h-4 w-4" />} label="Home" collapsed={collapsed} onNavigate={onNavigate} />
      {section("Unite")}
      <NavItem to="/social" icon={<Compass className="h-4 w-4" />} label="Social" collapsed={collapsed} onNavigate={onNavigate} />
      <NavItem to="/connect" end icon={<Users className="h-4 w-4" />} label="Communities" collapsed={collapsed} onNavigate={onNavigate} />
      <NavItem to="/connect/dm" icon={<MessagesSquare className="h-4 w-4" />} label="Messages" collapsed={collapsed} onNavigate={onNavigate} />
      <NavItem
        to="/notifications"
        icon={<Bell className="h-4 w-4" />}
        label="Notifications"
        collapsed={collapsed}
        onNavigate={onNavigate}
        badge={unread > 0 ? <span className="rounded-full bg-magenta/20 px-1.5 text-[11px] font-semibold text-magenta">{unread > 99 ? "99+" : unread}</span> : undefined}
      />
      <NavItem to="/social/bookmarks" icon={<Bookmark className="h-4 w-4" />} label="Bookmarks" collapsed={collapsed} onNavigate={onNavigate} />
      {section("Ecosystem")}
      {PRODUCT_AREAS.filter((a) => a.id in AREA_ICON).map((a) => (
        <NavItem
          key={a.id}
          to={a.href}
          icon={AREA_ICON[a.id]}
          label={a.short === "Minecraft" ? "Minecraft DB" : a.short}
          collapsed={collapsed}
          onNavigate={onNavigate}
          badge={<span className={cn("rounded px-1 text-[10px]", a.status === "needs-infra" ? "text-warning" : "text-faint")}>{STATUS_LABEL[a.status]}</span>}
        />
      ))}
      <div className="mt-auto pt-4">
        {platformCan(me.role, "moderation.review") && <NavItem to="/mod" icon={<ShieldCheck className="h-4 w-4" />} label="Moderation" collapsed={collapsed} onNavigate={onNavigate} />}
        <NavItem to="/changelog" icon={<Scroll className="h-4 w-4" />} label="What's new" collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function AccountMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    qc.clear();
    navigate("/login");
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-xl p-1 hover:bg-surface-2" aria-label="Account menu">
        <Avatar user={me} size={30} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="sx-in absolute right-0 z-40 mt-2 w-60 rounded-xl border border-border-strong bg-surface-2 p-1.5 shadow-2xl">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{me.displayName}</p>
              <p className="truncate text-xs text-faint">@{me.username}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            {[
              ["/u/" + me.username, "Your profile"],
              ["/settings", "Settings & privacy"],
              ["/settings/data", "Your data"],
            ].map(([to, label]) => (
              <Link key={to} role="menuitem" to={to!} onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                {label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface-3 hover:text-fg">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  const LABELS: Record<string, string> = { social: "Social", connect: "Connect", dm: "Messages", c: "Community", settings: "Settings", mod: "Moderation", areas: "Ecosystem", notifications: "Notifications", u: "Profile", changelog: "What's new", tag: "Tag", post: "Post", bookmarks: "Bookmarks", explore: "Explore" };
  if (!parts.length) return <span className="text-sm font-medium">Home</span>;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link to="/" className="text-faint hover:text-fg">
        Home
      </Link>
      {parts.slice(0, 3).map((p, i) => {
        const href = "/" + parts.slice(0, i + 1).join("/");
        const label = LABELS[p] ?? decodeURIComponent(p);
        const last = i === Math.min(parts.length, 3) - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1.5">
            <span className="text-faint" aria-hidden>
              /
            </span>
            {last ? (
              <span className="truncate font-medium" aria-current="page">
                {label}
              </span>
            ) : (
              <Link to={href} className="truncate text-faint hover:text-fg">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const me = useMe();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(me.preferences.navCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    void api("/me/preferences", { method: "PATCH", body: { ...me.preferences, navCollapsed: next } })
      .then(() => qc.invalidateQueries({ queryKey: ["me"] }))
      .catch(() => {});
  };

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/80 transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-64")}>
        <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
          <Link to="/" aria-label="SythiX Unite home">
            {collapsed ? <SythixMark /> : <Wordmark />}
          </Link>
          {!collapsed && (
            <button onClick={toggle} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Collapse navigation" title="Collapse (Ctrl+B)">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <Nav collapsed={collapsed} />
        {collapsed && (
          <button onClick={toggle} className="mx-auto mb-3 rounded-lg p-2 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Expand navigation" title="Expand (Ctrl+B)">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="sx-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface">
            <div className="flex h-14 items-center justify-between px-4">
              <Wordmark />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-faint hover:bg-surface-2" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Nav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sx-glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 flex-1 md:block">
            <Breadcrumbs />
          </div>
          <div className="flex-1 md:hidden">
            <Wordmark compact />
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-surface-2/80 px-3 text-sm text-faint hover:border-border-strong hover:text-muted"
            aria-label="Search and commands (Ctrl+K)"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="hidden rounded border border-border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <Link to="/connect/dm" className="hidden rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg sm:block" aria-label="Messages">
            <MessageSquare className="h-4 w-4" />
          </Link>
          <BellLink />
          <AccountMenu />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function BellLink() {
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api<{ unread: number }>("/notifications/unread"), refetchInterval: 60_000 }).data?.unread ?? 0;
  return (
    <Link to="/notifications" className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}>
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-magenta shadow-[0_0_8px_var(--magenta)]" aria-hidden />}
    </Link>
  );
}
