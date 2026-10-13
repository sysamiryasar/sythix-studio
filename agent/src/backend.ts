import { open, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentConfig } from "./config.js";
import { RconClient, stripFormatting } from "./rcon.js";

export interface ConsoleLine {
  ts: number;
  level: string;
  line: string;
}
export interface ServerStatus {
  software: string | null;
  version: string | null;
  reachable: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  players: { uuid: string; name: string }[] | null;
  tps: [number, number, number] | null;
}
export interface Ban {
  uuid: string;
  name: string;
  reason: string | null;
  source: string | null;
  created: string | null;
  expires: string | null;
}

export interface ServerBackend {
  status(): Promise<ServerStatus>;
  exec(command: string): Promise<string>;
  drainConsole(max: number): ConsoleLine[];
  /** Ban list when it changed since the last call, else null. */
  bansIfChanged(): Promise<Ban[] | null>;
  close(): void;
}

/** Parses `list uuids` output: "There are 2 of a max of 20 players online: A (uuid), B (uuid)". */
export function parseList(out: string): { online: number; max: number; players: { uuid: string; name: string }[] } | null {
  const m = /There are (\d+)(?: of a max of|\/)\s*(\d+) players online:?\s*(.*)$/s.exec(stripFormatting(out).trim());
  if (!m) return null;
  const players = [...m[3]!.matchAll(/([A-Za-z0-9_]{1,16}) \(([0-9a-f-]{36})\)/g)].map((x) => ({ name: x[1]!, uuid: x[2]! }));
  return { online: Number(m[1]), max: Number(m[2]), players };
}

/** Parses Paper's `tps` output: "TPS from last 1m, 5m, 15m: 20.0, 19.98, *20.0". */
export function parseTps(out: string): [number, number, number] | null {
  const m = /TPS from last 1m, 5m, 15m:\s*\*?([\d.]+),\s*\*?([\d.]+),\s*\*?([\d.]+)/.exec(stripFormatting(out));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Reads software/version from Paper/Purpur's version_history.json ("git-Paper-123 (MC: 1.21.4)"). */
export function parseVersionHistory(json: string): { software: string | null; version: string | null } {
  try {
    const v = (JSON.parse(json) as { currentVersion?: string }).currentVersion ?? "";
    const sw = /git-(Paper|Purpur|Folia)-/i.exec(v)?.[1]?.toLowerCase() ?? null;
    const mc = /\(MC: ([\d.]+)\)/.exec(v)?.[1] ?? null;
    return { software: sw, version: mc };
  } catch {
    return { software: null, version: null };
  }
}

const LOG_LEVEL = /^\[\d{2}:\d{2}:\d{2}(?: [A-Z]+)?\s*(INFO|WARN|ERROR|DEBUG|FATAL)\]/;

/** Tails logs/latest.log, handling truncation/rotation. */
class LogTail {
  private pos = -1;
  private partial = "";
  readonly lines: ConsoleLine[] = [];
  constructor(private readonly file: string) {}
  async poll(): Promise<void> {
    let size: number;
    try {
      size = (await stat(this.file)).size;
    } catch {
      return;
    }
    if (this.pos < 0) this.pos = Math.max(0, size - 8192); // start near the end on first run
    if (size < this.pos) {
      this.pos = 0;
      this.partial = "";
    }
    if (size === this.pos) return;
    const len = Math.min(size - this.pos, 256 * 1024);
    const fh = await open(this.file, "r");
    try {
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, this.pos);
      this.pos += len;
      const text = this.partial + buf.toString("utf8");
      const parts = text.split(/\r?\n/);
      this.partial = parts.pop() ?? "";
      for (const line of parts) {
        if (!line) continue;
        const level = LOG_LEVEL.exec(line)?.[1] ?? "INFO";
        this.lines.push({ ts: Date.now(), level: level === "FATAL" ? "ERROR" : level, line: stripFormatting(line).slice(0, 1000) });
      }
      if (this.lines.length > 2000) this.lines.splice(0, this.lines.length - 2000);
    } finally {
      await fh.close();
    }
  }
}

export class LiveBackend implements ServerBackend {
  private rcon: RconClient;
  private tail: LogTail;
  private timer: NodeJS.Timeout;
  private bansMtime = 0;
  constructor(private readonly cfg: AgentConfig) {
    this.rcon = new RconClient(cfg.rcon.host, cfg.rcon.port, cfg.rcon.password);
    this.tail = new LogTail(path.join(cfg.serverDir, "logs", "latest.log"));
    this.timer = setInterval(() => void this.tail.poll().catch(() => {}), 1000);
  }
  async status(): Promise<ServerStatus> {
    const ver = parseVersionHistory(await readFile(path.join(this.cfg.serverDir, "version_history.json"), "utf8").catch(() => "{}"));
    try {
      const list = parseList(await this.rcon.exec("list uuids"));
      const tps = parseTps(await this.rcon.exec("tps").catch(() => ""));
      return { ...ver, reachable: true, playersOnline: list?.online ?? null, playersMax: list?.max ?? null, players: list?.players ?? null, tps };
    } catch {
      this.rcon.close();
      return { ...ver, reachable: false, playersOnline: null, playersMax: null, players: null, tps: null };
    }
  }
  async exec(command: string): Promise<string> {
    return stripFormatting(await this.rcon.exec(command));
  }
  drainConsole(max: number): ConsoleLine[] {
    return this.tail.lines.splice(0, max);
  }
  async bansIfChanged(): Promise<Ban[] | null> {
    const file = path.join(this.cfg.serverDir, "banned-players.json");
    try {
      const st = await stat(file);
      if (st.mtimeMs === this.bansMtime) return null;
      this.bansMtime = st.mtimeMs;
      const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, string>[];
      return raw.slice(0, 1000).map((b) => ({ uuid: String(b.uuid ?? ""), name: String(b.name ?? "").slice(0, 16), reason: b.reason ?? null, source: b.source ?? null, created: b.created ?? null, expires: b.expires ?? null }));
    } catch {
      return null;
    }
  }
  close(): void {
    clearInterval(this.timer);
    this.rcon.close();
  }
}

/**
 * Simulated server for evaluating SythiX without a Minecraft server. Every
 * heartbeat is flagged mode="simulated" and the UI labels it a sample environment.
 */
export class SimulatedBackend implements ServerBackend {
  private players = [
    { name: "Sample_Alex", uuid: "00000000-0000-4000-8000-000000000001" },
    { name: "Sample_Steve", uuid: "00000000-0000-4000-8000-000000000002" },
  ];
  private bans: Ban[] = [];
  private bansDirty = true;
  private lines: ConsoleLine[] = [];
  private timer: NodeJS.Timeout;
  constructor() {
    this.log("INFO", "[SIMULATED] Sample environment started — this is not a real Minecraft server");
    this.timer = setInterval(() => this.log("INFO", `[SIMULATED] ${this.players.length} sample players online`), 30_000);
  }
  private log(level: string, line: string) {
    this.lines.push({ ts: Date.now(), level, line: `[${new Date().toISOString().slice(11, 19)} ${level}]: ${line}` });
  }
  async status(): Promise<ServerStatus> {
    const jitter = () => Math.round((19.7 + Math.random() * 0.3) * 100) / 100;
    return { software: "paper", version: "1.21.4", reachable: true, playersOnline: this.players.length, playersMax: 20, players: this.players, tps: [jitter(), jitter(), jitter()] };
  }
  async exec(command: string): Promise<string> {
    const [root, arg, ...rest] = command.split(/\s+/);
    let out: string;
    if (root === "kick" && arg) {
      const before = this.players.length;
      this.players = this.players.filter((p) => p.name.toLowerCase() !== arg.toLowerCase());
      out = before === this.players.length ? "No player was found" : `Kicked ${arg}: ${rest.join(" ") || "Kicked by an operator"}`;
    } else if (root === "ban" && arg) {
      this.players = this.players.filter((p) => p.name.toLowerCase() !== arg.toLowerCase());
      this.bans.push({ uuid: `00000000-0000-4000-8000-${String(this.bans.length).padStart(12, "0")}`, name: arg, reason: rest.join(" ") || null, source: "SythiX", created: new Date().toISOString(), expires: "forever" });
      this.bansDirty = true;
      out = `Banned ${arg}: ${rest.join(" ") || "Banned by an operator"}`;
    } else if (root === "pardon" && arg) {
      const before = this.bans.length;
      this.bans = this.bans.filter((b) => b.name.toLowerCase() !== arg.toLowerCase());
      this.bansDirty = true;
      out = before === this.bans.length ? "Nothing changed. The player isn't banned" : `Unbanned ${arg}`;
    } else if (root === "minecraft:reload") {
      out = "Reloading!";
    } else if (root === "datapack") {
      out = "There are 2 data pack(s) enabled: [vanilla (built-in)], [file/sythix-sample.zip (world)]";
    } else {
      out = `[SIMULATED] Command accepted: ${command}`;
    }
    this.log("INFO", `[SIMULATED] Rcon issued: ${command}`);
    return out;
  }
  drainConsole(max: number): ConsoleLine[] {
    return this.lines.splice(0, max);
  }
  async bansIfChanged(): Promise<Ban[] | null> {
    if (!this.bansDirty) return null;
    this.bansDirty = false;
    return [...this.bans];
  }
  close(): void {
    clearInterval(this.timer);
  }
}

export function hostMetrics() {
  return { memUsed: os.totalmem() - os.freemem(), memTotal: os.totalmem(), load1: Math.round(os.loadavg()[0]! * 100) / 100, cpus: os.cpus().length || 1 };
}
