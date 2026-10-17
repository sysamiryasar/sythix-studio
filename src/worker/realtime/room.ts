import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

interface Attachment {
  id: string;
  username: string;
  hidden: boolean;
  lastTypingAt: number;
}

/**
 * One instance per room (`channel:<id>`, `conv:<id>`, `user:<id>`). The Worker
 * authenticates and authorises the connection before forwarding it here; this
 * object only fans out events. Uses the WebSocket Hibernation API so idle
 * connections don't accrue duration charges.
 */
export class RealtimeRoom extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const id = req.headers.get("x-sx-user-id");
    const username = req.headers.get("x-sx-username");
    if (!id || !username) return new Response("Unauthenticated", { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, username, hidden: req.headers.get("x-sx-hidden") === "1", lastTypingAt: 0 } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 512) return;
    let msg: { type?: string };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as Attachment;
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (msg.type === "typing") {
      const now = Date.now();
      if (now - me.lastTypingAt < 2000) return; // throttle per connection
      ws.serializeAttachment({ ...me, lastTypingAt: now });
      const payload = JSON.stringify({ type: "typing", user: { id: me.id, username: me.username } });
      for (const other of this.ctx.getWebSockets()) if (other !== ws) this.safeSend(other, payload);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, "closed");
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  /** Called by the Worker (RPC) after it has persisted a change. */
  async broadcast(payload: string): Promise<number> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) this.safeSend(ws, payload);
    return sockets.length;
  }

  private broadcastPresence(exclude?: WebSocket) {
    const users = new Map<string, { id: string; username: string }>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.hidden) users.set(a.id, { id: a.id, username: a.username });
    }
    const payload = JSON.stringify({ type: "presence", users: [...users.values()] });
    for (const ws of this.ctx.getWebSockets()) if (ws !== exclude) this.safeSend(ws, payload);
  }

  private safeSend(ws: WebSocket, payload: string) {
    try {
      ws.send(payload);
    } catch {
      /* socket closing */
    }
  }
}
