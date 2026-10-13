import type { AppContext } from "./context";
import { newId } from "./ids";
import { run } from "./db/sql";

export interface AuditInput {
  actorType?: "user" | "agent" | "system";
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  workspaceId?: string | null;
  serverId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(ctx: AppContext, e: AuditInput): Promise<void> {
  await run(
    ctx.db,
    `INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, workspace_id, server_id, ip, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("aud"),
    e.actorType ?? "user",
    e.actorId,
    e.action,
    e.targetType ?? null,
    e.targetId ?? null,
    e.workspaceId ?? null,
    e.serverId ?? null,
    ctx.ip,
    e.metadata ? JSON.stringify(e.metadata) : null,
    ctx.now(),
  );
}
