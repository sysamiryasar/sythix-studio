// Agent-side copy of the operation rules. These are enforced locally even if
// the cloud is compromised. Kept in sync with src/modules/serveros/protocol.ts
// (a test asserts the kind lists and denylist match).

export const COMMAND_KINDS = [
  "console.command",
  "players.kick",
  "players.ban",
  "players.unban",
  "plugins.scan",
  "config.read",
  "config.write",
  "config.backups",
  "config.restore",
  "datapack.deploy",
] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

export const DENIED_CONSOLE_ROOTS = ["stop", "restart", "end", "rl", "reload", "op", "deop", "plugman", "pex", "lp", "luckperms", "save-off"] as const;

export const PLAYER_RE = /^[A-Za-z0-9_]{3,16}$/;
export const PLUGIN_RE = /^[A-Za-z0-9_.-]{1,64}$/;
export const CONFIG_FILE_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_.\-/]+\.(yml|yaml|json|properties|toml|conf)$/;
export const BACKUP_RE = /^\d{8}T\d{6}Z(-\d+)?$/;
export const DATAPACK_RE = /^sythix-[a-z0-9_-]{1,48}\.zip$/;
export const SHA_RE = /^[a-f0-9]{64}$/;

export class Rejected extends Error {}

export function str(v: unknown, re: RegExp, field: string, max = 256): string {
  if (typeof v !== "string" || v.length > max || !re.test(v)) throw new Rejected(`Invalid ${field}`);
  return v;
}

/** Validates a console command against the single-line rule and both denylists. */
export function checkConsoleCommand(cmd: unknown, extraDenied: string[]): string {
  if (typeof cmd !== "string") throw new Rejected("Invalid command");
  const c = cmd.trim().replace(/^\//, "");
  if (!c || c.length > 256 || /[\r\n\0]/.test(c)) throw new Rejected("Commands must be a single line of at most 256 characters");
  const root = c.split(/\s+/)[0]!.toLowerCase().replace(/^minecraft:/, "");
  if ((DENIED_CONSOLE_ROOTS as readonly string[]).includes(root) || extraDenied.map((d) => d.toLowerCase()).includes(root)) {
    throw new Rejected(`"${root}" is blocked by the agent's local policy`);
  }
  return c;
}

/** Strips characters that could break out of an RCON command argument. */
export function safeReason(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\r\n\0§]/g, " ").slice(0, 200) : "";
}
