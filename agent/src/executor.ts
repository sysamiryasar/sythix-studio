import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./config.js";
import type { ServerBackend } from "./backend.js";
import { resolveInside } from "./fsguard.js";
import { listZipNames, parsePluginYml, readZipEntry, type PluginInfo } from "./jar.js";
import { BACKUP_RE, CONFIG_FILE_RE, COMMAND_KINDS, DATAPACK_RE, PLAYER_RE, PLUGIN_RE, Rejected, SHA_RE, checkConsoleCommand, safeReason, str, type CommandKind } from "./protocol.js";

export interface Command {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}
export interface CommandResult {
  commandId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const CONFIG_MAX = 256 * 1024;
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

function backupId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export interface Downloader {
  /** Fetches a deployment artifact from SythiX using the agent credential. */
  artifact(deploymentId: string): Promise<Buffer>;
}

/**
 * Executes one cloud-requested operation after re-validating it against the
 * local configuration. Anything not explicitly allowed is rejected here.
 */
export class Executor {
  constructor(
    private readonly cfg: AgentConfig,
    private readonly backend: ServerBackend,
    private readonly downloader: Downloader,
  ) {}

  private requireAllowed(kind: CommandKind) {
    const a = this.cfg.allow;
    const ok: Record<CommandKind, boolean> = {
      "console.command": a.console,
      "players.kick": a.players,
      "players.ban": a.players,
      "players.unban": a.players,
      "plugins.scan": a.plugins,
      "config.read": a.configRead,
      "config.backups": a.configRead,
      "config.write": a.configRead && a.configWrite,
      "config.restore": a.configRead && a.configWrite,
      "datapack.deploy": a.datapackDeploy,
    };
    if (!ok[kind]) throw new Rejected(`"${kind}" is disabled in this agent's local configuration`);
  }

  async run(cmd: Command): Promise<CommandResult> {
    try {
      if (!(COMMAND_KINDS as readonly string[]).includes(cmd.kind)) throw new Rejected(`Unknown operation "${cmd.kind}"`);
      const kind = cmd.kind as CommandKind;
      this.requireAllowed(kind);
      const result = await this.dispatch(kind, cmd.payload ?? {});
      return { commandId: cmd.id, ok: true, result };
    } catch (err) {
      return { commandId: cmd.id, ok: false, error: err instanceof Rejected ? err.message : `Agent error: ${(err as Error).message}`.slice(0, 2000) };
    }
  }

  private pluginsDir() {
    return path.join(this.cfg.serverDir, "plugins");
  }

  private async dispatch(kind: CommandKind, p: Record<string, unknown>): Promise<unknown> {
    switch (kind) {
      case "console.command": {
        const command = checkConsoleCommand(p.command, this.cfg.deniedCommands);
        return { output: (await this.backend.exec(command)).slice(0, 8000) };
      }
      case "players.kick":
        return { output: await this.backend.exec(`kick ${str(p.player, PLAYER_RE, "player")} ${safeReason(p.reason)}`.trim()) };
      case "players.ban":
        return { output: await this.backend.exec(`ban ${str(p.player, PLAYER_RE, "player")} ${safeReason(p.reason)}`.trim()) };
      case "players.unban":
        return { output: await this.backend.exec(`pardon ${str(p.player, PLAYER_RE, "player")}`) };
      case "plugins.scan":
        return { plugins: await this.scanPlugins(), simulated: this.cfg.mode === "simulated" };
      case "config.read": {
        const file = await this.configPath(p);
        const buf = await readFile(file);
        if (buf.length > CONFIG_MAX) throw new Rejected("File is larger than 256 KB");
        return { content: buf.toString("utf8"), sha256: sha256(buf), size: buf.length };
      }
      case "config.write": {
        const file = await this.configPath(p);
        const content = typeof p.content === "string" ? p.content : "";
        if (Buffer.byteLength(content) > CONFIG_MAX) throw new Rejected("Content is larger than 256 KB");
        const current = await readFile(file);
        if (sha256(current) !== str(p.expectedSha256, SHA_RE, "expectedSha256")) throw new Rejected("The file changed on the server since it was opened. Reload it and reapply your edit.");
        const id = await this.backup(file, `plugins/${p.plugin}/${p.file}`);
        const tmp = `${file}.sythix-tmp`;
        await writeFile(tmp, content, "utf8");
        await rename(tmp, file);
        return { backupId: id, sha256: sha256(content), note: "Saved. Plugins usually need their own reload command or a restart to apply changes; SythiX never restarts servers automatically." };
      }
      case "config.backups": {
        const rel = `plugins/${str(p.plugin, PLUGIN_RE, "plugin")}/${str(p.file, CONFIG_FILE_RE, "file", 160)}`;
        const root = path.join(this.cfg.serverDir, ".sythix-backups");
        const ids = await readdir(root).catch(() => [] as string[]);
        const out: { backupId: string; size: number }[] = [];
        for (const id of ids.filter((i) => BACKUP_RE.test(i)).sort().reverse()) {
          const st = await stat(path.join(root, id, rel)).catch(() => null);
          if (st) out.push({ backupId: id, size: st.size });
        }
        return { backups: out.slice(0, 50) };
      }
      case "config.restore": {
        const file = await this.configPath(p);
        const id = str(p.backupId, BACKUP_RE, "backupId");
        const rel = `plugins/${p.plugin}/${p.file}`;
        const src = await resolveInside(path.join(this.cfg.serverDir, ".sythix-backups", id), rel);
        const safety = await this.backup(file, rel);
        await copyFile(src, file);
        return { restoredFrom: id, backupOfCurrent: safety };
      }
      case "datapack.deploy":
        return this.deployDatapack(p);
    }
  }

  private async configPath(p: Record<string, unknown>): Promise<string> {
    const plugin = str(p.plugin, PLUGIN_RE, "plugin");
    const file = str(p.file, CONFIG_FILE_RE, "file", 160);
    const pluginRoot = await resolveInside(this.pluginsDir(), plugin);
    return resolveInside(pluginRoot, file);
  }

  /** Copies a file into .sythix-backups/<id>/<rel>; returns the backup id. */
  private async backup(file: string, rel: string): Promise<string> {
    let id = backupId();
    const root = path.join(this.cfg.serverDir, ".sythix-backups");
    for (let n = 1; await stat(path.join(root, id, rel)).then(() => true, () => false); n++) id = `${backupId()}-${n}`;
    const dest = path.join(root, id, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(file, dest);
    return id;
  }

  private async scanPlugins(): Promise<PluginInfo[]> {
    if (this.cfg.mode === "simulated") {
      return [
        { name: "SampleEssentials", version: "1.0.0-sample", file: "SampleEssentials.jar", apiVersion: "1.21", description: "[SIMULATED] Sample plugin entry", authors: ["SythiX"] },
        { name: "SampleProtect", version: "2.3.1-sample", file: "SampleProtect.jar", apiVersion: "1.20", description: "[SIMULATED] Sample plugin entry", authors: ["SythiX"] },
      ];
    }
    const files = (await readdir(this.pluginsDir()).catch(() => [] as string[])).filter((f) => f.endsWith(".jar")).slice(0, 300);
    const out: PluginInfo[] = [];
    for (const f of files) {
      try {
        const buf = await readFile(await resolveInside(this.pluginsDir(), f));
        const entry = readZipEntry(buf, (n) => n === "paper-plugin.yml" || n === "plugin.yml");
        const info = entry && parsePluginYml(entry.data.toString("utf8"), f);
        out.push(info ?? { name: f.replace(/\.jar$/, ""), version: "unknown", file: f, description: "No plugin.yml found" });
      } catch {
        out.push({ name: f.replace(/\.jar$/, ""), version: "unknown", file: f, description: "Could not be read" });
      }
    }
    return out;
  }

  private async deployDatapack(p: Record<string, unknown>) {
    const deploymentId = str(p.deploymentId, /^[a-z]{2,5}_[0-9a-z]{8,32}$/, "deploymentId");
    const fileName = str(p.fileName, DATAPACK_RE, "fileName");
    const expected = str(p.sha256, SHA_RE, "sha256");
    const buf = await this.downloader.artifact(deploymentId);
    if (typeof p.size === "number" && buf.length !== p.size) throw new Rejected("Downloaded artifact size does not match the deployment plan");
    if (sha256(buf) !== expected) throw new Rejected("Downloaded artifact hash does not match the deployment plan");
    const names = listZipNames(buf);
    if (!names.includes("pack.mcmeta")) throw new Rejected("Artifact is not a datapack (no pack.mcmeta at the archive root)");
    if (names.some((n) => n.startsWith("/") || n.split("/").includes(".."))) throw new Rejected("Artifact contains unsafe paths");

    const packsDir = path.join(this.cfg.serverDir, this.cfg.worldName, "datapacks");
    await mkdir(packsDir, { recursive: true });
    const target = await resolveInside(packsDir, fileName, { mustExist: false });
    let previousBackup: string | null = null;
    if (await stat(target).then(() => true, () => false)) previousBackup = await this.backup(target, `${this.cfg.worldName}/datapacks/${fileName}`);
    const tmp = `${target}.sythix-tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, target);

    let reloaded = false;
    let listOutput: string | null = null;
    if (p.reloadAfter === true) {
      await this.backend.exec("minecraft:reload");
      reloaded = true;
    }
    try {
      listOutput = (await this.backend.exec("datapack list enabled")).slice(0, 2000);
    } catch {
      listOutput = null;
    }
    return {
      path: `${this.cfg.worldName}/datapacks/${fileName}`,
      sha256: expected,
      previousBackup,
      reloaded,
      enabled: listOutput ? listOutput.includes(`file/${fileName}`) : null,
      note: reloaded ? "Datapacks reloaded with /minecraft:reload." : "Installed. Run /minecraft:reload (or restart) to activate.",
    };
  }
}
