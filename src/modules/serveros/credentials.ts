import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, run } from "@/lib/db/sql";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import { recordAudit } from "@/lib/audit";
import { requireServer } from "@/lib/authz/check";

/** Token format: sxa_<8-char prefix>_<43-char secret>. Only its SHA-256 is stored. */
export async function issueCredential(ctx: AppContext, user: SessionUser, serverId: string, label: string, revokeOthers = false): Promise<{ id: string; token: string; prefix: string }> {
  await requireServer(ctx, user, serverId, "server.credentials.manage");
  const prefix = randomToken(6).replace(/[-_]/g, "x").slice(0, 8);
  const token = `sxa_${prefix}_${randomToken(32)}`;
  const id = newId("crd");
  await run(
    ctx.db,
    `INSERT INTO agent_credentials (id, server_id, token_prefix, token_hash, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, serverId, prefix, await sha256Hex(token), label.slice(0, 64) || "Agent credential", user.id, ctx.now(),
  );
  if (revokeOthers) {
    await run(ctx.db, `UPDATE agent_credentials SET revoked_at = ?, revoked_by = ? WHERE server_id = ? AND id <> ? AND revoked_at IS NULL`, ctx.now(), user.id, serverId, id);
  }
  await recordAudit(ctx, { actorId: user.id, action: revokeOthers ? "server.credential_rotated" : "server.credential_issued", targetType: "credential", targetId: id, serverId, metadata: { prefix } });
  return { id, token, prefix };
}

export async function revokeCredential(ctx: AppContext, user: SessionUser, serverId: string, credentialId: string) {
  await requireServer(ctx, user, serverId, "server.credentials.manage");
  const n = await run(ctx.db, `UPDATE agent_credentials SET revoked_at = ?, revoked_by = ? WHERE id = ? AND server_id = ? AND revoked_at IS NULL`, ctx.now(), user.id, credentialId, serverId);
  if (!n) throw notFound("Active credential");
  await recordAudit(ctx, { actorId: user.id, action: "server.credential_revoked", targetType: "credential", targetId: credentialId, serverId });
}

export async function listCredentials(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.credentials.manage");
  return all<{ id: string; token_prefix: string; label: string; created_at: number; last_used_at: number | null; revoked_at: number | null; created_by_name: string }>(
    ctx.db,
    `SELECT c.id, c.token_prefix, c.label, c.created_at, c.last_used_at, c.revoked_at, u.username AS created_by_name
       FROM agent_credentials c JOIN users u ON u.id = c.created_by WHERE c.server_id = ? ORDER BY c.revoked_at IS NOT NULL, c.created_at DESC`,
    serverId,
  );
}

export interface AgentPrincipal {
  credentialId: string;
  serverId: string;
  workspaceId: string;
}

/** Resolves an agent bearer token to its server. Revoked or unknown tokens resolve to null. */
export async function authenticateAgent(ctx: AppContext, authorization: string | null): Promise<AgentPrincipal | null> {
  const m = /^Bearer (sxa_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{20,64})$/.exec(authorization ?? "");
  if (!m) return null;
  const row = await one<{ id: string; server_id: string; workspace_id: string; last_used_at: number | null }>(
    ctx.db,
    `SELECT c.id, c.server_id, s.workspace_id, c.last_used_at FROM agent_credentials c JOIN servers s ON s.id = c.server_id WHERE c.token_hash = ? AND c.revoked_at IS NULL`,
    await sha256Hex(m[1]!),
  );
  if (!row) return null;
  if (!row.last_used_at || ctx.now() - row.last_used_at > 60_000) await run(ctx.db, `UPDATE agent_credentials SET last_used_at = ? WHERE id = ?`, ctx.now(), row.id);
  return { credentialId: row.id, serverId: row.server_id, workspaceId: row.workspace_id };
}
