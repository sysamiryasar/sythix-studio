import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { checkConsoleCommand, COMMAND_KINDS as AGENT_KINDS, DENIED_CONSOLE_ROOTS as AGENT_DENIED } from "../src/protocol.js";
import { COMMAND_KINDS as SERVER_KINDS, DENIED_CONSOLE_ROOTS as SERVER_DENIED } from "../../src/modules/serveros/protocol";
import { resolveInside } from "../src/fsguard.js";
import { parseList, parseTps, parseVersionHistory, SimulatedBackend } from "../src/backend.js";
import { readZipEntry, parsePluginYml } from "../src/jar.js";
import { Executor } from "../src/executor.js";
import { RconClient } from "../src/rcon.js";
import type { AgentConfig } from "../src/config.js";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let dir: string;
let cfg: AgentConfig;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sythix-agent-"));
  mkdirSync(path.join(dir, "plugins", "Demo"), { recursive: true });
  writeFileSync(path.join(dir, "plugins", "Demo", "config.yml"), "greeting: hello\n");
  writeFileSync(path.join(dir, "secret.txt"), "top secret");
  cfg = {
    apiUrl: "http://localhost:3000",
    token: "sxa_abcdefgh_" + "x".repeat(43),
    mode: "simulated",
    serverDir: dir,
    worldName: "world",
    rcon: { host: "127.0.0.1", port: 25575, password: "" },
    allow: { console: true, players: true, plugins: true, configRead: true, configWrite: true, datapackDeploy: true },
    deniedCommands: ["whitelist"],
  };
});

describe("protocol", () => {
  it("agent and server agree on operation kinds and the console denylist", () => {
    expect([...AGENT_KINDS]).toEqual([...SERVER_KINDS]);
    expect([...AGENT_DENIED]).toEqual([...SERVER_DENIED]);
  });
  it("refuses stop/restart/reload/op, multi-line and locally denied commands", () => {
    for (const c of ["stop", "/restart", "minecraft:reload", "op Steve", "reload confirm", "say hi\nstop", "whitelist off"]) {
      expect(() => checkConsoleCommand(c, cfg.deniedCommands), c).toThrow();
    }
    expect(checkConsoleCommand("/say hello", [])).toBe("say hello");
  });
});

describe("filesystem guard", () => {
  it("blocks traversal, absolute paths and symlinks out of the root", async () => {
    const root = path.join(dir, "plugins");
    await expect(resolveInside(root, "../secret.txt")).rejects.toThrow(/escapes/);
    await expect(resolveInside(root, "/etc/passwd")).rejects.toThrow(/escapes/);
    symlinkSync(path.join(dir, "secret.txt"), path.join(root, "Demo", "link.yml"));
    await expect(resolveInside(path.join(root, "Demo"), "link.yml")).rejects.toThrow(/Symbolic/);
    expect(await resolveInside(root, "Demo/config.yml")).toBe(path.join(root, "Demo", "config.yml"));
  });
});

describe("parsers", () => {
  it("parses list, tps and version history output", () => {
    expect(parseList("There are 1 of a max of 20 players online: Notch (069a79f4-44e9-4726-a5be-fca90e38aaf5)")).toEqual({
      online: 1,
      max: 20,
      players: [{ name: "Notch", uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5" }],
    });
    expect(parseList("There are 0 of a max of 10 players online: ")?.players).toEqual([]);
    expect(parseTps("§6TPS from last 1m, 5m, 15m: §a20.0, §a19.98, §a*20.0")).toEqual([20, 19.98, 20]);
    expect(parseTps("Unknown command")).toBeNull();
    expect(parseVersionHistory('{"currentVersion":"git-Purpur-2389 (MC: 1.21.4)"}')).toEqual({ software: "purpur", version: "1.21.4" });
  });
  it("reads plugin.yml from a jar", () => {
    const jar = Buffer.from(zipSync({ "plugin.yml": new TextEncoder().encode("name: DemoPlugin\nversion: '2.1'\napi-version: 1.21\nauthors: [Alice, Bob]\n"), "a/B.class": new Uint8Array(10) }));
    const entry = readZipEntry(jar, (n) => n === "plugin.yml")!;
    expect(parsePluginYml(entry.data.toString(), "Demo.jar")).toMatchObject({ name: "DemoPlugin", version: "2.1", apiVersion: "1.21", authors: ["Alice", "Bob"] });
  });
});

describe("executor", () => {
  const exec = (c: AgentConfig, artifact?: Buffer) => new Executor(c, new SimulatedBackend(), { artifact: async () => artifact ?? Buffer.alloc(0) });

  it("rejects operations disabled locally, even if the cloud requests them", async () => {
    const r = await exec({ ...cfg, allow: { ...cfg.allow, configWrite: false } }).run({ id: "cmd_1", kind: "config.write", payload: { plugin: "Demo", file: "config.yml", content: "x", expectedSha256: "0".repeat(64) } });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/disabled/) });
    expect((await exec(cfg).run({ id: "cmd_2", kind: "shell.exec", payload: {} })).ok).toBe(false);
  });

  it("reads, writes with backup and conflict detection, lists and restores configs", async () => {
    const e = exec(cfg);
    const read = await e.run({ id: "c1", kind: "config.read", payload: { plugin: "Demo", file: "config.yml" } });
    const { content, sha256 } = read.result as { content: string; sha256: string };
    expect(content).toBe("greeting: hello\n");
    const stale = await e.run({ id: "c2", kind: "config.write", payload: { plugin: "Demo", file: "config.yml", content: "x: 1\n", expectedSha256: "f".repeat(64) } });
    expect(stale.error).toMatch(/changed on the server/);
    const write = await e.run({ id: "c3", kind: "config.write", payload: { plugin: "Demo", file: "config.yml", content: "greeting: hi\n", expectedSha256: sha256 } });
    expect(write.ok).toBe(true);
    expect(readFileSync(path.join(dir, "plugins/Demo/config.yml"), "utf8")).toBe("greeting: hi\n");
    const { backupId } = write.result as { backupId: string };
    const list = await e.run({ id: "c4", kind: "config.backups", payload: { plugin: "Demo", file: "config.yml" } });
    expect((list.result as { backups: { backupId: string }[] }).backups[0]!.backupId).toBe(backupId);
    const restore = await e.run({ id: "c5", kind: "config.restore", payload: { plugin: "Demo", file: "config.yml", backupId } });
    expect(restore.ok).toBe(true);
    expect(readFileSync(path.join(dir, "plugins/Demo/config.yml"), "utf8")).toBe("greeting: hello\n");
    const escape = await e.run({ id: "c6", kind: "config.read", payload: { plugin: "Demo", file: "../../secret.yml" } });
    expect(escape.ok).toBe(false);
  });

  it("deploys a verified datapack and refuses tampered artifacts", async () => {
    const pack = Buffer.from(zipSync({ "pack.mcmeta": new TextEncoder().encode('{"pack":{"pack_format":61,"description":"x"}}') }));
    const payload = { deploymentId: "dep_0123456789ab", fileName: "sythix-demo.zip", sha256: sha(pack), size: pack.length, reloadAfter: true };
    const ok = await exec(cfg, pack).run({ id: "d1", kind: "datapack.deploy", payload });
    expect(ok).toMatchObject({ ok: true, result: { reloaded: true, path: "world/datapacks/sythix-demo.zip" } });
    expect(existsSync(path.join(dir, "world/datapacks/sythix-demo.zip"))).toBe(true);
    const tampered = await exec(cfg, Buffer.concat([pack, Buffer.from("x")])).run({ id: "d2", kind: "datapack.deploy", payload });
    expect(tampered.error).toMatch(/size|hash/);
    const notPack = Buffer.from(zipSync({ "evil.sh": new Uint8Array(3) }));
    const r = await exec(cfg, notPack).run({ id: "d3", kind: "datapack.deploy", payload: { ...payload, sha256: sha(notPack), size: notPack.length } });
    expect(r.error).toMatch(/not a datapack/);
    const badName = await exec(cfg, pack).run({ id: "d4", kind: "datapack.deploy", payload: { ...payload, fileName: "../../server.jar" } });
    expect(badName.ok).toBe(false);
  });
});

describe("RCON client", () => {
  let server: net.Server;
  let port = 0;
  afterEach(() => server?.close());

  it("authenticates and executes commands against an RCON endpoint", async () => {
    server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
          const len = buf.readInt32LE(0);
          const id = buf.readInt32LE(4);
          const type = buf.readInt32LE(8);
          const body = buf.subarray(12, 4 + len - 2).toString();
          buf = buf.subarray(4 + len);
          const reply = (rid: number, text: string) => {
            const b = Buffer.from(text);
            const p = Buffer.alloc(14 + b.length);
            p.writeInt32LE(10 + b.length, 0);
            p.writeInt32LE(rid, 4);
            p.writeInt32LE(type === 3 ? 2 : 0, 8);
            b.copy(p, 12);
            sock.write(p);
          };
          if (type === 3) reply(body === "pw" ? id : -1, "");
          else reply(id, `echo:${body}`);
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as net.AddressInfo).port;
    const good = new RconClient("127.0.0.1", port, "pw");
    expect(await good.exec("list uuids")).toBe("echo:list uuids");
    expect(await good.exec("tps")).toBe("echo:tps");
    good.close();
    const bad = new RconClient("127.0.0.1", port, "nope");
    await expect(bad.exec("list")).rejects.toThrow(/authentication/);
  });
});
