"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/** Route-based tabs; each tab is a real URL so state survives reloads and sharing. */
export function RouteTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const full = search ? `${pathname}?${search}` : pathname;
  const exactHit = tabs.some((t) => t.href === full);
  const isActive = (t: { href: string; exact?: boolean }) =>
    exactHit ? t.href === full : t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
  return (
    <nav aria-label="Sections" className="sx-scroll -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-border px-1">
      {tabs.map((t) => {
        const active = isActive(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3 py-2 text-sm transition-colors",
              active ? "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SegmentedControl<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded px-2.5 py-1 text-xs transition-colors", value === o.value ? "bg-surface-3 text-fg shadow" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
