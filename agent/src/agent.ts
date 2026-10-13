#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { capabilities, loadConfig, type AgentConfig } from "./config.js";
import { hostMetrics, LiveBackend, SimulatedBackend, type ServerBackend } from "./backend.js";
import { Executor, type Command, type CommandResult } from "./executor.js";

export const AGENT_VERSION = "0.1.0";

function log(msg: string) {
  console.log(`[sythix-agent ${new Date().toISOString()}] ${msg}`);
}

export class Agent {
  private results: CommandResult[] = [];
  private stopped = false;
  private interval = 10_000;
  private failures = 0;
  readonly backend: ServerBackend;
  readonly executor: Executor;

  constructor(private readonly cfg: AgentConfig, backend?: ServerBackend, private readonly fetchImpl: typeof fetch = fetch) {
    this.backend = backend ?? (cfg.mode === "simulated" ? new SimulatedBackend(path.join(cfg.serverDir, cfg.worldName, "datapacks")) : new LiveBackend(cfg));
    this.executor = new Executor(cfg, this.backend, {
      artifact: async (id) => {
        const res = await this.fetchImpl(new URL(`/api/agent/v1/deployments/${encodeURIComponent(id)}/artifact`, cfg.apiUrl), { headers: { authorization: `Bearer ${cfg.token}` } });
        if (!res.ok) throw new Error(`artifact download failed (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 20 * 1024 * 1024) throw new Error("artifact too large");
        return buf;
      },
    });
  }

  /** One heartbeat round trip: report status/console/results, receive and execute commands. */
  async tick(): Promise<{ commands: number }> {
    const status = await this.backend.status();
    const results = this.results.splice(0, 50);
    const body = {
      agentVersion: AGENT_VERSION,
      mode: this.cfg.mode,
      capabilities: capabilities(this.cfg),
      server: status,
      host: hostMetrics(),
      console: this.backend.drainConsole(200),
      bans: await this.backend.bansIfChanged(),
      results,
    };
    const res = await this.fetchImpl(new URL("/api/agent/v1/heartbeat", this.cfg.apiUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      this.results.unshift(...results);
      throw Object.assign(new Error("Credential rejected (revoked or invalid). Issue a new one in ServerOS."), { fatal: true });
    }
    if (!res.ok) {
      this.results.unshift(...results);
      throw new Error(`Heartbeat failed with HTTP ${res.status}`);
    }
    const { data } = (await res.json()) as { data: { heartbeatIntervalMs: number; commands: Command[] } };
    this.interval = Math.min(Math.max(data.heartbeatIntervalMs ?? 10_000, 2_000), 60_000);
    for (const cmd of data.commands ?? []) {
      log(`executing ${cmd.kind} (${cmd.id})`);
      const r = await this.executor.run(cmd);
      if (!r.ok) log(`  rejected/failed: ${r.error}`);
      this.results.push(r);
    }
    return { commands: data.commands?.length ?? 0 };
  }

  async run(): Promise<void> {
    log(`started in ${this.cfg.mode} mode for ${this.cfg.apiUrl} (capabilities: ${capabilities(this.cfg).join(", ")})`);
    while (!this.stopped) {
      let delay = this.interval;
      try {
        const { commands } = await this.tick();
        if (this.failures) log("connection restored");
        this.failures = 0;
        if (commands) delay = 1000; // deliver results promptly
      } catch (err) {
        if ((err as { fatal?: boolean }).fatal) {
          log((err as Error).message);
          this.stop();
          process.exitCode = 1;
          return;
        }
        this.failures++;
        delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.failures, 5));
        log(`${(err as Error).message}; retrying in ${Math.round(delay / 1000)}s`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  stop(): void {
    this.stopped = true;
    this.backend.close();
  }
}

function usage(): never {
  console.log(`SythiX ServerOS agent ${AGENT_VERSION}

Usage:
  sythix-agent init --api-url <url> --token <sxa_...> [--server-dir <dir>] [--simulated]
  sythix-agent run [--config sythix-agent.json]

The agent connects outbound to SythiX Studio. RCON must be enabled in
server.properties and bound to localhost; never expose RCON publicly.`);
  process.exit(0);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help" || cmd === "-h") usage();
  if (cmd === "init") {
    const file = path.resolve(arg("--config") ?? "sythix-agent.json");
    if (existsSync(file)) throw new Error(`${file} already exists`);
    const simulated = process.argv.includes("--simulated");
    const serverDir = arg("--server-dir") ?? (simulated ? "./sythix-sample-server" : ".");
    const cfg = {
      apiUrl: arg("--api-url"),
      token: arg("--token"),
      mode: simulated ? "simulated" : "live",
      serverDir,
      worldName: "world",
      rcon: { host: "127.0.0.1", port: 25575, password: "set-rcon.password-from-server.properties" },
      allow: { console: true, players: true, plugins: true, configRead: true, configWrite: false, datapackDeploy: false },
      deniedCommands: [],
    };
    writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
    chmodSync(file, 0o600);
    if (simulated) {
      const dir = path.resolve(path.dirname(file), serverDir);
      mkdirSync(path.join(dir, "plugins", "SampleEssentials"), { recursive: true });
      mkdirSync(path.join(dir, "world", "datapacks"), { recursive: true });
      writeFileSync(path.join(dir, "plugins", "SampleEssentials", "config.yml"), "# SIMULATED sample config\nwelcome-message: \"Welcome to the sample server\"\nspawn-protection: 16\n");
    }
    log(`wrote ${file} (mode 600). Review the "allow" section, then run: sythix-agent run --config ${file}`);
    return;
  }
  if (cmd === "run") {
    const cfg = loadConfig(path.resolve(arg("--config") ?? "sythix-agent.json"));
    const agent = new Agent(cfg);
    process.on("SIGINT", () => agent.stop());
    process.on("SIGTERM", () => agent.stop());
    await agent.run();
    return;
  }
  usage();
}

if (process.argv[1] && /sythix-agent|agent\.(js|ts)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`[sythix-agent] ${(err as Error).message}`);
    process.exit(1);
  });
}
