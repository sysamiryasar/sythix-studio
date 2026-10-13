"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Check, ChevronRight, ChevronsUpDown, LogOut, Menu, Search, Settings, User, Briefcase } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { ShellData } from "@/lib/shell";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Popover, MenuItem } from "./popover";

const SEGMENT_LABELS: Record<string, string> = {
  nexus: "NexusID",
  forge: "ForgeOS",
  servers: "ServerOS",
  studio: "Studio",
  settings: "Settings",
  cosmetics: "Cosmetics",
  achievements: "Achievements",
  friends: "Friends",
  teams: "Teams",
  modules: "Modules",
  updates: "Updates",
  audit: "Audit log",
  reports: "Reports",
  notifications: "Notifications",
  console: "Console",
  players: "Players",
  plugins: "Plugins",
  deployments: "Deployments",
  access: "Access",
  items: "Items",
  abilities: "Abilities",
  sets: "Equipment sets",
  assets: "Assets",
  exports: "Export",
  history: "History",
  new: "New",
  security: "Security",
  preferences: "Preferences",
  account: "Account",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => ({
    href: "/" + parts.slice(0, i + 1).join("/"),
    label: SEGMENT_LABELS[p] ?? (/^[a-z]{2,5}_[0-9a-z]+$/.test(p) ? "Details" : decodeURIComponent(p)),
  }));
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
      <Link href="/" className="text-muted hover:text-fg">
        Studio
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
          {i === crumbs.length - 1 ? (
            <span aria-current="page" className="truncate text-fg">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="truncate text-muted hover:text-fg">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function WorkspaceSwitcher({ data }: { data: ShellData }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Popover
      label="Workspaces"
      align="left"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs hover:border-border-strong">
          <Briefcase className="h-3.5 w-3.5 text-accent" />
          <span className="max-w-[140px] truncate">{data.workspace.name}</span>
          <ChevronsUpDown className="h-3 w-3 text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Workspaces</div>
          {data.workspaces.map((w) => (
            <MenuItem
              key={w.id}
              onClick={async () => {
                close();
                if (w.id === data.workspace.id) return;
                try {
                  await api("/api/v1/me/preferences", { method: "PATCH", body: { defaultWorkspaceId: w.id } });
                  router.refresh();
                } catch (e) {
                  toast.error("Could not switch workspace", (e as Error).message);
                }
              }}
            >
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === data.workspace.id && <Check className="h-3.5 w-3.5 text-accent" />}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

function Notifications({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await api<{ unread: number }>("/api/v1/notifications?countOnly=1");
        setUnread(r.unread);
      } catch {
        /* offline or signed out */
      }
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const load = async () => {
    const r = await api<{ items: NotificationItem[]; unread: number }>("/api/v1/notifications");
    setItems(r.items);
    setUnread(r.unread);
  };
  return (
    <Popover
      label="Notifications"
      width={340}
      trigger={({ toggle, open }) => (
        <button
          onClick={() => {
            if (!open) load().catch(() => setItems([]));
            toggle();
          }}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-xs font-semibold">Notifications</span>
            <button
              className="text-[11px] text-accent hover:underline"
              onClick={async () => {
                await api("/api/v1/notifications", { method: "POST", body: { ids: "all" } });
                setUnread(0);
                setItems((x) => x?.map((i) => ({ ...i, read_at: i.read_at ?? Date.now() })) ?? null);
              }}
            >
              Mark all read
            </button>
          </div>
          <div className="sx-scroll max-h-80 overflow-y-auto">
            {items === null && <p className="px-2.5 py-4 text-xs text-muted">Loading…</p>}
            {items?.length === 0 && <p className="px-2.5 py-4 text-xs text-muted">You&apos;re all caught up.</p>}
            {items?.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/notifications"}
                onClick={() => {
                  close();
                  if (!n.read_at) api("/api/v1/notifications", { method: "POST", body: { ids: [n.id] } }).catch(() => {});
                }}
                className="flex gap-2 rounded-md px-2.5 py-2 hover:bg-surface-2"
              >
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0">
                  <span className="block text-sm text-fg">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                  <span className="text-[11px] text-faint">{formatRelative(n.created_at)}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link href="/notifications" onClick={close} className="block border-t border-border px-2.5 py-2 text-center text-xs text-muted hover:text-fg">
            View all
          </Link>
        </div>
      )}
    </Popover>
  );
}

function UserMenu({ data }: { data: ShellData }) {
  const toast = useToast();
  return (
    <Popover
      label="Account"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-label="Account menu" className="rounded-md p-0.5 hover:ring-2 hover:ring-border-strong">
          <Avatar name={data.user.displayName} size={28} />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="border-b border-border px-2.5 pb-2 pt-1.5">
            <div className="truncate text-sm font-medium">{data.user.displayName}</div>
            <div className="truncate text-xs text-muted">@{data.user.username}</div>
          </div>
          <div className="pt-1">
            <MenuItem href={`/u/${data.user.username}`}>
              <User className="h-3.5 w-3.5" /> Public profile
            </MenuItem>
            <MenuItem href="/settings">
              <Settings className="h-3.5 w-3.5" /> Account settings
            </MenuItem>
            <MenuItem
              danger
              onClick={async () => {
                try {
                  await api("/api/v1/auth/logout", { method: "POST", body: {} });
                  window.location.href = "/login";
                } catch (e) {
                  toast.error("Sign out failed", (e as Error).message);
                }
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </MenuItem>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function Topbar({ data, onOpenPalette, onOpenMobileNav }: { data: ShellData; onOpenPalette: () => void; onOpenMobileNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-4">
      <button className="rounded p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open navigation" onClick={onOpenMobileNav}>
        <Menu className="h-4 w-4" />
      </button>
      <WorkspaceSwitcher data={data} />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={onOpenPalette}
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-muted hover:border-border-strong hover:text-fg sm:w-56"
          aria-label="Search and commands"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden flex-1 text-left sm:inline">Search or run a command</span>
          <span className="hidden sm:inline">
            <Kbd>Ctrl K</Kbd>
          </span>
        </button>
        <Notifications initialUnread={data.unread} />
        <UserMenu data={data} />
      </div>
    </header>
  );
}
