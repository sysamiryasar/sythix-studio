import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-border-strong text-muted bg-surface-2",
  accent: "border-accent/40 text-accent bg-accent-soft",
  success: "border-success/40 text-success bg-success/10",
  warning: "border-warning/40 text-warning bg-warning/10",
  danger: "border-danger/40 text-danger bg-danger/10",
  info: "border-cyan/40 text-cyan bg-cyan/10",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse, label }: { tone: Tone; pulse?: boolean; label: string }) {
  const color = { neutral: "bg-faint", accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-cyan" }[tone];
  return (
    <span className="relative inline-flex h-2 w-2" role="img" aria-label={label} title={label}>
      {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

/** Marks data that is not live (sample, placeholder, unavailable) so it is never mistaken for real metrics. */
export function DataSourceBadge({ source }: { source: "live" | "sample" | "placeholder" | "unavailable" | "stale" }) {
  const map = {
    live: { tone: "success" as const, text: "Live" },
    stale: { tone: "warning" as const, text: "Last known" },
    sample: { tone: "warning" as const, text: "Sample data" },
    placeholder: { tone: "warning" as const, text: "Placeholder asset" },
    unavailable: { tone: "neutral" as const, text: "Unavailable" },
  }[source];
  return <Badge tone={map.tone}>{map.text}</Badge>;
}
