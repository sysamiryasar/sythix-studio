export function formatRelative(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return "never";
  const diff = now - ts;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000 * 365, "y"],
    [86_400_000 * 30, "mo"],
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  if (abs < 45_000) return diff >= 0 ? "just now" : "in a moment";
  for (const [ms, u] of units) if (abs >= ms) return diff >= 0 ? `${Math.floor(abs / ms)}${u} ago` : `in ${Math.floor(abs / ms)}${u}`;
  return "just now";
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
