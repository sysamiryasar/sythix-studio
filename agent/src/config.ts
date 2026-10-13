import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AgentConfig {
  /** Base URL of SythiX Studio, e.g. https://studio.example.com */
  apiUrl: string;
  /** Agent credential issued in ServerOS (sxa_...). Keep this file readable only by the server user. */
  token: string;
  /** "live" talks to a real Paper/Purpur server; "simulated" produces clearly-labelled sample data. */
  mode: "live" | "simulated";
  /** Server root directory (contains server.properties, plugins/, logs/). */
  serverDir: string;
  /** World folder name, used for datapack deployment. */
  worldName: string;
  rcon: { host: string; port: number; password: string };
  /** Local allowlist. The cloud can only request what is enabled here. */
  allow: {
    console: boolean;
    players: boolean;
    plugins: boolean;
    configRead: boolean;
    configWrite: boolean;
    datapackDeploy: boolean;
  };
  /** Extra console command roots to refuse, on top of the built-in denylist. */
  deniedCommands: string[];
}

const DEFAULTS: Omit<AgentConfig, "apiUrl" | "token"> = {
  mode: "live",
  serverDir: ".",
  worldName: "world",
  rcon: { host: "127.0.0.1", port: 25575, password: "" },
  allow: { console: true, players: true, plugins: true, configRead: true, configWrite: false, datapackDeploy: false },
  deniedCommands: [],
};

export function loadConfig(file: string): AgentConfig {
  const st = statSync(file);
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
    console.warn(`[sythix-agent] WARNING: ${file} is readable by other users. Run: chmod 600 ${file}`);
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<AgentConfig>;
  const cfg: AgentConfig = {
    ...DEFAULTS,
    ...raw,
    rcon: { ...DEFAULTS.rcon, ...(raw.rcon ?? {}) },
    allow: { ...DEFAULTS.allow, ...(raw.allow ?? {}) },
  } as AgentConfig;
  if (!cfg.apiUrl || !/^https?:\/\//.test(cfg.apiUrl)) throw new Error("config.apiUrl must be an http(s) URL");
  if (cfg.apiUrl.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(cfg.apiUrl)) throw new Error("config.apiUrl must use https unless it points at localhost");
  if (!/^sxa_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{20,64}$/.test(cfg.token ?? "")) throw new Error("config.token is missing or malformed");
  if (!["127.0.0.1", "localhost", "::1"].includes(cfg.rcon.host)) throw new Error("RCON must be reached on localhost only; never expose RCON to the network");
  cfg.serverDir = path.resolve(path.dirname(file), cfg.serverDir);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cfg.worldName)) throw new Error("config.worldName is invalid");
  return cfg;
}

export function capabilities(cfg: AgentConfig): string[] {
  const c: string[] = [];
  if (cfg.allow.console) c.push("console");
  if (cfg.allow.players) c.push("players");
  if (cfg.allow.plugins) c.push("plugins");
  if (cfg.allow.configRead) c.push("config");
  if (cfg.allow.configRead && cfg.allow.configWrite) c.push("config.write");
  if (cfg.allow.datapackDeploy) c.push("datapack.deploy");
  return c;
}
