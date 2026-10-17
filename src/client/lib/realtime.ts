import { useEffect, useRef, useState } from "react";
import type { RealtimeEvent } from "@shared/types";

export type RealtimeStatus = "connecting" | "open" | "closed";

/**
 * Subscribes to a realtime room over WebSocket with automatic reconnect
 * (exponential backoff). Returns connection status and a `send` for typing pings.
 * `onReconnect` lets callers refetch anything missed while disconnected.
 */
export function useRoom(room: string | null, onEvent: (e: RealtimeEvent) => void, onReconnect?: () => void) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onEvent);
  const reconnectHandler = useRef(onReconnect);
  useEffect(() => {
    handler.current = onEvent;
    reconnectHandler.current = onReconnect;
  });

  useEffect(() => {
    if (!room) return;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/realtime?room=${encodeURIComponent(room)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (attempt > 0) reconnectHandler.current?.();
        attempt = 0;
        setStatus("open");
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as RealtimeEvent | { type: "pong" };
          if (e.type !== "pong") handler.current(e as RealtimeEvent);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        setStatus("closed");
        if (closed) return;
        attempt++;
        timer = setTimeout(connect, Math.min(30_000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [room]);

  const send = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  };
  return { status, send };
}
