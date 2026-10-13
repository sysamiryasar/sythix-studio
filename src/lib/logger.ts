type Level = "debug" | "info" | "warn" | "error";

/** Structured JSON logs; Workers Observability indexes these fields. Never log secrets or tokens. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const entry = { level, event, ts: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}
