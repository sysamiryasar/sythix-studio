import { useId } from "react";

/** The SythiX mark: a hexagonal "unite" knot. Original artwork. */
export function SythixMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset=".55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke={`url(#${id})`} strokeWidth="4" strokeLinejoin="round" />
      <path d="m21 21 22 22M43 21 21 43" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4.5" fill="#e879f9" />
    </svg>
  );
}

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <SythixMark />
      {!compact && (
        <span className="font-display text-[15px] font-semibold tracking-tight">
          SythiX <span className="sx-gradient-text">Unite</span>
        </span>
      )}
    </span>
  );
}
