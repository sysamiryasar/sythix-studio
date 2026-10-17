import type { Ctx } from "../env";
import { newId } from "./ids";
import { run } from "./db";

export async function audit(ctx: Ctx, e: { actorId: string | null; action: string; targetType?: string; targetId?: string; meta?: Record<string, unknown> }) {
  await run(
    ctx.db,
    `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("aud"),
    e.actorId,
    e.action,
    e.targetType ?? null,
    e.targetId ?? null,
    JSON.stringify(e.meta ?? {}),
    ctx.ip,
    ctx.now(),
  );
}
