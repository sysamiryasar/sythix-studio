"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import type { ShellData } from "@/lib/shell";
import { api } from "@/lib/client/api";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/badge";
import { Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { Wordmark } from "./logo";

const GO_SHORTCUTS: Record<string, string> = { h: "/", n: "/nexus", f: "/forge", s: "/servers", m: "/studio/modules", u: "/studio/updates" };

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(data.prefs.sidebarCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(0);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      api("/api/v1/me/preferences", { method: "PATCH", body: { sidebarCollapsed: !c } }).catch(() => {});
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (isTyping(e) || mod || e.altKey) return;
      if (e.key === "?") {
        setHelpOpen(true);
        return;
      }
      if (e.key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (Date.now() - pendingG.current < 1000 && GO_SHORTCUTS[e.key]) {
        pendingG.current = 0;
        router.push(GO_SHORTCUTS[e.key]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggleSidebar]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-white">
        Skip to content
      </a>
      <Sidebar data={data} collapsed={collapsed} onToggle={toggleSidebar} />

      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-pop-in flex-col border-r border-border bg-surface">
            <div className="flex h-12 items-center justify-between border-b border-border px-3">
              <Link href="/" onClick={() => setMobileOpen(false)}>
                <Wordmark />
              </Link>
              <button className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav data={data} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar data={data} onOpenPalette={() => setPaletteOpen(true)} onOpenMobileNav={() => setMobileOpen(true)} />
        {!data.user.emailVerified && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">Your email address is not verified. Some features are limited until you verify it.</div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} data={data} />
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" size="sm">
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <dt className="text-muted">Command palette &amp; search</dt><dd><Kbd>Ctrl/⌘ K</Kbd></dd>
          <dt className="text-muted">Toggle sidebar</dt><dd><Kbd>Ctrl/⌘ B</Kbd></dd>
          <dt className="text-muted">Go to Studio home</dt><dd><Kbd>g</Kbd> <Kbd>h</Kbd></dd>
          <dt className="text-muted">Go to NexusID</dt><dd><Kbd>g</Kbd> <Kbd>n</Kbd></dd>
          <dt className="text-muted">Go to ForgeOS</dt><dd><Kbd>g</Kbd> <Kbd>f</Kbd></dd>
          <dt className="text-muted">Go to ServerOS</dt><dd><Kbd>g</Kbd> <Kbd>s</Kbd></dd>
          <dt className="text-muted">Go to Modules</dt><dd><Kbd>g</Kbd> <Kbd>m</Kbd></dd>
          <dt className="text-muted">Show this help</dt><dd><Kbd>?</Kbd></dd>
        </dl>
      </Dialog>
    </div>
  );
}
