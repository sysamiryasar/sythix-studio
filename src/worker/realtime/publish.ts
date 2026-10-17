import type { Ctx } from "../env";
import type { RealtimeEvent } from "@shared/types";

/**
 * Fan-out of an event to everyone connected to a room. Delivery is best-effort:
 * the database is the source of truth, and clients refetch on reconnect.
 */
export async function publish(ctx: Ctx, room: string, event: RealtimeEvent): Promise<void> {
  try {
    const ns = ctx.env.REALTIME;
    if (!ns) return;
    await ns.get(ns.idFromName(room)).broadcast(JSON.stringify(event));
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "realtime.publish_failed", room, message: (err as Error).message }));
  }
}
