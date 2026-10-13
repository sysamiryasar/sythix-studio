"use client";

import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * Relative timestamps depend on the current time, which differs between the
 * server render and hydration. The <time> element carries the exact instant and
 * suppresses the expected text mismatch on this node only.
 */
export function RelativeTime({ ts, now }: { ts: number | null | undefined; now?: number }) {
  if (!ts) return <>never</>;
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatDateTime(ts)} suppressHydrationWarning>
      {formatRelative(ts, now)}
    </time>
  );
}
