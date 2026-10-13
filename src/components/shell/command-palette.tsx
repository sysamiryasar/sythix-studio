"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, FileBox, Hammer, Plus, Search, Server, Settings, User, Users, Puzzle, Package } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { ShellData } from "@/lib/shell";
import { Kbd } from "@/components/ui/badge";

export interface SearchResult {
  type: "project" | "item" | "asset" | "server" | "player" | "team" | "module" | "setting";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  href: string;
  group: string;
  keywords?: string;
}

const TYPE_ICON: Record<SearchResult["type"], React.ReactNode> = {
  project: <Hammer className="h-4 w-4" />,
  item: <Package className="h-4 w-4" />,
  asset: <FileBox className="h-4 w-4" />,
  server: <Server className="h-4 w-4" />,
  player: <User className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  module: <Puzzle className="h-4 w-4" />,
  setting: <Settings className="h-4 w-4" />,
};

function staticCommands(data: ShellData): Command[] {
  const nav: Command[] = data.nav.map((n) => ({ id: `nav:${n.href}`, label: `Open ${n.label}`, icon: <ArrowRight className="h-4 w-4" />, href: n.href, group: "Navigate" }));
  const has = (id: string) => data.nav.some((n) => n.moduleId === id);
  return [
    ...(has("forgeos") ? [{ id: "new-project", label: "Create ForgeOS project", icon: <Plus className="h-4 w-4" />, href: "/forge?new=1", group: "Actions", keywords: "new project item" }] : []),
    ...(has("serveros") ? [{ id: "new-server", label: "Register a server", icon: <Plus className="h-4 w-4" />, href: "/servers/new", group: "Actions", keywords: "add paper purpur" }] : []),
    ...(has("nexusid") ? [{ id: "edit-profile", label: "Edit NexusID profile", icon: <User className="h-4 w-4" />, href: "/nexus", group: "Actions" }] : []),
    { id: "settings", label: "Open account settings", icon: <Settings className="h-4 w-4" />, href: "/settings", group: "Actions", keywords: "password sessions security" },
    { id: "prefs", label: "Change theme and preferences", icon: <Settings className="h-4 w-4" />, href: "/settings/preferences", group: "Actions", keywords: "dark light theme" },
    ...nav,
    { id: "modules", label: "Open module manager", icon: <Puzzle className="h-4 w-4" />, href: "/studio/modules", group: "Navigate" },
    { id: "updates", label: "Open Studio updates", icon: <ArrowRight className="h-4 w-4" />, href: "/studio/updates", group: "Navigate" },
  ];
}

export function CommandPalette({ open, onClose, data }: { open: boolean; onClose: () => void; data: ShellData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => staticCommands(data), [data]);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<{ results: SearchResult[] }>(`/api/v1/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        setResults(r.results);
        setActive(0);
      } catch {
        /* aborted or failed; keep commands only */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const needle = q.trim().toLowerCase();
  const filtered = commands.filter((c) => !needle || `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(needle));
  const entries: { key: string; label: string; sub?: string; icon: React.ReactNode; href: string; group: string }[] = [
    ...results.map((r) => ({ key: `${r.type}:${r.id}`, label: r.title, sub: r.subtitle, icon: TYPE_ICON[r.type], href: r.href, group: "Results" })),
    ...filtered.map((c) => ({ key: c.id, label: c.label, sub: c.hint, icon: c.icon, href: c.href, group: c.group })),
  ];

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl animate-pop-in overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl sx-glow"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && entries[active]) {
                e.preventDefault();
                go(entries[active]!.href);
              }
            }}
            placeholder="Search projects, items, servers, players, teams, settings…"
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
            role="combobox"
            aria-expanded="true"
            aria-controls="sx-palette-list"
            aria-activedescendant={entries[active] ? `sx-cmd-${active}` : undefined}
          />
          {loading && <span className="text-[11px] text-faint">Searching…</span>}
        </div>
        <ul id="sx-palette-list" role="listbox" className="sx-scroll max-h-[50vh] overflow-y-auto p-1.5">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
          {entries.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <li key={e.key} role="presentation">
                {header && <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{header}</div>}
                <button
                  id={`sx-cmd-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e.href)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm", i === active ? "bg-accent-soft text-fg" : "text-muted")}
                >
                  <span className={i === active ? "text-accent" : "text-faint"}>{e.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{e.label}</span>
                    {e.sub && <span className="block truncate text-xs text-faint">{e.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-faint">
          <span><Kbd>↑↓</Kbd> navigate</span>
          <span><Kbd>Enter</Kbd> open</span>
          <span><Kbd>Esc</Kbd> close</span>
          <span className="ml-auto">Destructive actions always ask for confirmation.</span>
        </div>
      </div>
    </div>
  );
}
