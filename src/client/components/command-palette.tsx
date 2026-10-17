import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hash, Loader2, PenSquare, Search, Users, FileText, Zap } from "lucide-react";
import type { SearchResults } from "@shared/types";
import { PRODUCT_AREAS } from "@shared/areas";
import { platformCan } from "@shared/permissions";
import { api } from "../lib/api";
import { useMe } from "../lib/session";
import { Avatar, cn } from "./ui";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Everything Command: one box that searches people, posts, tags and communities
 * the viewer may see, and runs navigation actions. Results come from the
 * permission-filtered /api/search endpoint, so nothing inaccessible appears.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 180);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useQuery({ queryKey: ["search", term], queryFn: ({ signal }) => api<SearchResults>(`/search?q=${encodeURIComponent(term)}`, { signal }), enabled: open && term.length >= 2 });

  const go = (to: string) => () => {
    onClose();
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "a-post", group: "Actions", label: "Create a post", icon: <PenSquare className="h-4 w-4" />, run: go("/social?compose=1") },
      { id: "a-community", group: "Actions", label: "Create a community", icon: <Users className="h-4 w-4" />, run: go("/connect?create=1") },
      { id: "a-dm", group: "Actions", label: "New message", icon: <Zap className="h-4 w-4" />, run: go("/connect/dm?new=1") },
      { id: "n-home", group: "Go to", label: "Home", icon: <ArrowRight className="h-4 w-4" />, run: go("/") },
      { id: "n-social", group: "Go to", label: "Social feed", icon: <ArrowRight className="h-4 w-4" />, run: go("/social") },
      { id: "n-explore", group: "Go to", label: "Explore & trending", icon: <ArrowRight className="h-4 w-4" />, run: go("/social/explore") },
      { id: "n-connect", group: "Go to", label: "Communities", icon: <ArrowRight className="h-4 w-4" />, run: go("/connect") },
      { id: "n-dm", group: "Go to", label: "Messages", icon: <ArrowRight className="h-4 w-4" />, run: go("/connect/dm") },
      { id: "n-notif", group: "Go to", label: "Notifications", icon: <ArrowRight className="h-4 w-4" />, run: go("/notifications") },
      { id: "n-bookmarks", group: "Go to", label: "Bookmarks", icon: <ArrowRight className="h-4 w-4" />, run: go("/social/bookmarks") },
      { id: "n-profile", group: "Go to", label: "Your profile", icon: <ArrowRight className="h-4 w-4" />, run: go(`/u/${me.username}`) },
      { id: "n-settings", group: "Go to", label: "Settings", hint: "profile, privacy, appearance", icon: <ArrowRight className="h-4 w-4" />, run: go("/settings") },
      { id: "n-appearance", group: "Go to", label: "Appearance", hint: "theme, motion, dashboard", icon: <ArrowRight className="h-4 w-4" />, run: go("/settings/appearance") },
      { id: "n-data", group: "Go to", label: "Export or delete your data", icon: <ArrowRight className="h-4 w-4" />, run: go("/settings/data") },
      { id: "n-changelog", group: "Go to", label: "What's new", icon: <ArrowRight className="h-4 w-4" />, run: go("/changelog") },
      ...PRODUCT_AREAS.filter((a) => a.href.startsWith("/areas")).map((a) => ({ id: `area-${a.id}`, group: "Ecosystem", label: a.name, hint: a.status === "live" ? "" : "not available yet", icon: <ArrowRight className="h-4 w-4" />, run: go(a.href) })),
      ...(platformCan(me.role, "moderation.review") ? [{ id: "n-mod", group: "Go to", label: "Moderation queue", icon: <ArrowRight className="h-4 w-4" />, run: go("/mod") }] : []),
    ];
    const needle = q.trim().toLowerCase();
    const filtered = needle ? actions.filter((a) => `${a.label} ${a.hint ?? ""}`.toLowerCase().includes(needle)) : actions.slice(0, 9);
    const r = results.data;
    if (!r || term.length < 2) return filtered;
    return [
      ...filtered,
      ...r.users.map((u) => ({ id: `u-${u.id}`, group: "People", label: u.displayName, hint: `@${u.username}`, icon: <Avatar user={u} size={20} />, run: go(`/u/${u.username}`) })),
      ...r.communities.map((c) => ({ id: `c-${c.id}`, group: "Communities", label: c.name, hint: `${c.memberCount} members`, icon: <Users className="h-4 w-4" />, run: go(`/connect/c/${c.slug}`) })),
      ...r.tags.map((t) => ({ id: `t-${t.tag}`, group: "Tags", label: `#${t.tag}`, hint: `${t.count} posts`, icon: <Hash className="h-4 w-4" />, run: go(`/social/tag/${encodeURIComponent(t.tag)}`) })),
      ...r.posts.map((p) => ({ id: `p-${p.id}`, group: "Posts", label: p.body.slice(0, 80) || "(media)", hint: `@${p.author.username}`, icon: <FileText className="h-4 w-4" />, run: go(`/social/post/${p.id}`) })),
      { id: "s-all", group: "Search", label: `Search everything for “${term}”`, icon: <Search className="h-4 w-4" />, run: go(`/search?q=${encodeURIComponent(term)}`) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, term, results.data, me.username, me.role]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Everything Command" className="sx-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          {results.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-faint" /> : <Search className="h-4 w-4 text-faint" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                items[active]?.run();
              }
            }}
            placeholder="Search people, posts, #tags, communities — or type a command"
            aria-label="Search or command"
            role="combobox"
            aria-expanded="true"
            aria-controls="sx-palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-faint">Esc</kbd>
        </div>
        <ul id="sx-palette-list" role="listbox" className="sx-scroll max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">{term.length >= 2 && results.isFetching ? "Searching…" : "No matches."}</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{it.group}</div>}
                <div
                  id={`pal-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active ? "bg-accent-soft text-fg" : "text-muted")}
                >
                  <span className="shrink-0 text-faint">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="truncate text-xs text-faint">{it.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
