import net from "node:net";

// Minimal Source RCON client (the protocol Minecraft's enable-rcon speaks).
// Used only against localhost; see config validation.

const TYPE_AUTH = 3;
const TYPE_EXEC = 2;

export class RconClient {
  private socket: net.Socket | null = null;
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; chunks: string[]; timer: NodeJS.Timeout }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly host: string, private readonly port: number, private readonly password: string) {}

  get connected(): boolean {
    return !!this.socket && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      s.setTimeout(10_000);
      s.once("connect", () => resolve());
      s.once("error", reject);
      s.once("timeout", () => reject(new Error("RCON connect timeout")));
      s.on("data", (d) => this.onData(d));
      s.on("close", () => {
        this.socket = null;
        for (const p of this.pending.values()) p.reject(new Error("RCON connection closed"));
        this.pending.clear();
      });
      this.socket = s;
    });
    this.socket!.setTimeout(0);
    const ok = await this.request(TYPE_AUTH, this.password).then(() => true).catch(() => false);
    if (!ok) {
      this.close();
      throw new Error("RCON authentication failed");
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  /** Executes a command; requests are serialised so responses never interleave. */
  exec(command: string): Promise<string> {
    const run = this.queue.then(async () => {
      await this.connect();
      return this.request(TYPE_EXEC, command);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private request(type: number, body: string): Promise<string> {
    const id = this.nextId++ & 0x7fffffff;
    const payload = Buffer.from(body, "utf8");
    const packet = Buffer.alloc(14 + payload.length);
    packet.writeInt32LE(10 + payload.length, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    // two trailing null bytes already zero
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("RCON response timeout"));
      }, 10_000);
      this.pending.set(id, { resolve, reject, chunks: [], timer });
      this.socket!.write(packet);
      // Minecraft responds to each exec with one packet (up to 4096 bytes). A short
      // settle window collects any split packets before resolving.
    });
  }

  private onData(d: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, d]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (len < 10 || len > 1_048_576) {
        this.close();
        return;
      }
      if (this.buffer.length < len + 4) return;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.subarray(12, 4 + len - 2).toString("utf8");
      this.buffer = this.buffer.subarray(4 + len);
      if (id === -1) {
        for (const p of this.pending.values()) p.reject(new Error("RCON authentication failed"));
        this.pending.clear();
        continue;
      }
      const p = this.pending.get(id);
      if (!p) continue;
      p.chunks.push(body);
      clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        this.pending.delete(id);
        p.resolve(p.chunks.join(""));
      }, body.length >= 4000 ? 150 : 5);
    }
  }
}

/** Strips Minecraft § formatting codes from RCON output. */
export function stripFormatting(s: string): string {
  return s.replace(/§[0-9a-fk-or]/gi, "");
}
