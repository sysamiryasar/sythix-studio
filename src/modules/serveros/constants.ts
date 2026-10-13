/** Agents heartbeat every 10s; a server is considered disconnected after 45s of silence. */
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_STALE_MS = 45_000;
export const COMMAND_TTL_MS = 5 * 60_000;
export const CONSOLE_RETENTION_LINES = 2000;
export const TELEMETRY_RETENTION_MS = 7 * 86_400_000;
export const SUPPORTED_SOFTWARE = ["paper", "purpur"] as const;
export type ServerSoftware = (typeof SUPPORTED_SOFTWARE)[number];
