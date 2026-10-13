import { z } from "zod";

// The typed operations the cloud may queue for an agent. The agent keeps its
// own copy of these rules (agent/src/protocol.ts) and enforces them locally;
// tests/serveros-protocol.test.ts asserts both lists stay identical.

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

/** Console commands that are never relayed. Restarts/stops must be done on the host, deliberately. */
export const DENIED_CONSOLE_ROOTS = ["stop", "restart", "end", "rl", "reload", "op", "deop", "plugman", "pex", "lp", "luckperms", "save-off"] as const;

export const playerName = z.string().regex(/^[A-Za-z0-9_]{3,16}$/, "Enter a valid Minecraft username.");
export const pluginName = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, "Invalid plugin folder name.");
export const configFile = z
  .string()
  .max(160)
  .regex(/^(?!.*\.\.)(?!\/)[A-Za-z0-9_.\-/]+\.(yml|yaml|json|properties|toml|conf)$/, "Only .yml, .yaml, .json, .properties, .toml and .conf files inside the plugin folder can be edited.");

export const consoleCommandSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((c) => !/[\r\n\0]/.test(c), "Commands must be a single line.")
  .refine((c) => !DENIED_CONSOLE_ROOTS.includes(c.replace(/^\//, "").split(/\s+/)[0]!.toLowerCase().replace(/^minecraft:/, "") as (typeof DENIED_CONSOLE_ROOTS)[number]), "This command can't be run remotely. Stops, restarts, reloads and operator changes must be done on the server host.");

export const payloadSchemas = {
  "console.command": z.object({ command: consoleCommandSchema }),
  "players.kick": z.object({ player: playerName, reason: z.string().max(200).default("") }),
  "players.ban": z.object({ player: playerName, reason: z.string().max(200).default("") }),
  "players.unban": z.object({ player: playerName }),
  "plugins.scan": z.object({}),
  "config.read": z.object({ plugin: pluginName, file: configFile }),
  "config.write": z.object({ plugin: pluginName, file: configFile, content: z.string().max(256 * 1024), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  "config.backups": z.object({ plugin: pluginName, file: configFile }),
  "config.restore": z.object({ plugin: pluginName, file: configFile, backupId: z.string().regex(/^\d{8}T\d{6}Z(-\d+)?$/) }),
  "datapack.deploy": z.object({
    deploymentId: z.string().max(64),
    fileName: z.string().regex(/^sythix-[a-z0-9_-]{1,48}\.zip$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive().max(20 * 1024 * 1024),
    reloadAfter: z.boolean(),
  }),
} satisfies Record<CommandKind, z.ZodType>;

/** Capability names an agent may advertise. Operations are only offered when advertised. */
export const CAPABILITY_FOR_KIND: Record<CommandKind, string> = {
  "console.command": "console",
  "players.kick": "players",
  "players.ban": "players",
  "players.unban": "players",
  "plugins.scan": "plugins",
  "config.read": "config",
  "config.write": "config.write",
  "config.backups": "config",
  "config.restore": "config.write",
  "datapack.deploy": "datapack.deploy",
};

const consoleLine = z.object({ ts: z.number().int(), level: z.string().max(10), line: z.string().max(1000) });

export const heartbeatSchema = z.object({
  agentVersion: z.string().max(32),
  mode: z.enum(["live", "simulated"]),
  capabilities: z.array(z.string().max(32)).max(20),
  server: z.object({
    software: z.string().max(32).nullable(),
    version: z.string().max(32).nullable(),
    reachable: z.boolean(),
    playersOnline: z.number().int().min(0).nullable(),
    playersMax: z.number().int().min(0).nullable(),
    players: z.array(z.object({ uuid: z.string().max(40), name: z.string().max(16) })).max(1000).nullable(),
    tps: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  }),
  host: z
    .object({ memUsed: z.number().int().min(0), memTotal: z.number().int().min(0), load1: z.number().min(0), cpus: z.number().int().min(1) })
    .nullable(),
  console: z.array(consoleLine).max(200),
  bans: z
    .array(z.object({ uuid: z.string().max(40), name: z.string().max(16), reason: z.string().max(300).nullable(), source: z.string().max(64).nullable(), created: z.string().max(40).nullable(), expires: z.string().max(40).nullable() }))
    .max(1000)
    .nullable(),
  results: z
    .array(z.object({ commandId: z.string().max(64), ok: z.boolean(), result: z.unknown().optional(), error: z.string().max(2000).optional() }))
    .max(50),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;
