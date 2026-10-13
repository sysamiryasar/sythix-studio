"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Puzzle, RefreshCw, ScrollText, Settings, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { ModuleIcon } from "@/components/ui/icon";
import type { ShellData } from "@/lib/shell";
import { Wordmark, SythixMark } from "./logo";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ data, collapsed, onNavigate }: { data: ShellData; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
        active ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 sx-scroll">
      {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Modules</div>}
      {data.nav.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <div key={n.href}>
            {item(n.href, n.label, <ModuleIcon name={n.icon} className="h-4 w-4" />, active && (!n.children || pathname === n.href))}
            {!collapsed && active && n.children && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                {n.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={pathname === c.href ? "page" : undefined}
                    className={cn("block rounded px-2 py-1 text-xs", pathname === c.href ? "text-fg bg-surface-2" : "text-muted hover:text-fg")}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {data.unavailableModules.length > 0 && !collapsed && (
        <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
          {data.unavailableModules.map((m) => m.name).join(", ")} unavailable
        </div>
      )}
      <div className="mt-auto pt-4">
        {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Studio</div>}
        {item("/studio/modules", "Modules", <Puzzle className="h-4 w-4" />, isActive(pathname, "/studio/modules"))}
        {item("/studio/updates", "Updates", <RefreshCw className="h-4 w-4" />, isActive(pathname, "/studio/updates"))}
        {item("/studio/audit", "Audit log", <ScrollText className="h-4 w-4" />, isActive(pathname, "/studio/audit"))}
        {data.isPlatformAdmin && item("/studio/reports", "Reports", <ShieldAlert className="h-4 w-4" />, isActive(pathname, "/studio/reports"))}
        {item("/settings", "Settings", <Settings className="h-4 w-4" />, isActive(pathname, "/settings"))}
      </div>
    </nav>
  );
}

export function Sidebar({ data, collapsed, onToggle }: { data: ShellData; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-12 items-center border-b border-border", collapsed ? "justify-center" : "justify-between px-3")}>
        <Link href="/" aria-label="SythiX Studio home">{collapsed ? <SythixMark /> : <Wordmark />}</Link>
        {!collapsed && (
          <button onClick={onToggle} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl+B)">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      <SidebarNav data={data} collapsed={collapsed} />
      {collapsed && (
        <button onClick={onToggle} className="mx-auto mb-3 rounded p-1.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Expand sidebar" title="Expand sidebar (Ctrl+B)">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}
