"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Click-to-open menu panel that closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = 260,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn("absolute top-full z-50 mt-1.5 animate-pop-in rounded-lg border border-border-strong bg-surface p-1 shadow-2xl", align === "right" ? "right-0" : "left-0")}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, href, children, danger }: { onClick?: () => void; href?: string; children: ReactNode; danger?: boolean }) {
  const cls = cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-surface-2 hover:text-fg");
  if (href)
    return (
      <a role="menuitem" href={href} className={cls} onClick={onClick}>
        {children}
      </a>
    );
  return (
    <button role="menuitem" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
