import { z } from "zod";
import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, run } from "@/lib/db/sql";
import { notify } from "@/lib/notifications";
import { requireVerified } from "@/lib/authz/check";
import { slugify } from "@/lib/validation";
import { awardAchievement } from "./achievements";
import { findUserByUsername, isBlockedEitherWay } from "./social";

export const teamInput = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).default(""),
  visibility: z.enum(["public", "private"]).default("public"),
});

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner_id: string;
  visibility: "public" | "private";
  created_at: number;
}

export async function createTeam(ctx: AppContext, user: SessionUser, input: z.infer<typeof teamInput>): Promise<{ id: string; slug: string }> {
  requireVerified(user);
  const owned = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM teams WHERE owner_id = ?`, user.id);
  if ((owned?.n ?? 0) >= 10) throw badRequest("You can own at most 10 teams.");
  let slug = slugify(input.name);
  if (await one(ctx.db, `SELECT 1 FROM teams WHERE slug = ?`, slug)) slug = `${slug}-${newId("x").slice(-5)}`;
  const id = newId("tea");
  await ctx.db.batch([
    ctx.db
      .prepare(`INSERT INTO teams (id, slug, name, description, owner_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, slug, input.name, input.description, user.id, input.visibility, ctx.now(), ctx.now()),
    ctx.db.prepare(`INSERT INTO team_members (team_id, user_id, role, status, created_at) VALUES (?, ?, 'owner', 'active', ?)`).bind(id, user.id, ctx.now()),
  ]);
  await awardAchievement(ctx, user.id, "team_founder");
  return { id, slug };
}

async function membership(ctx: AppContext, teamId: string, userId: string) {
  return one<{ role: "owner" | "member"; status: "invited" | "active" }>(ctx.db, `SELECT role, status FROM team_members WHERE team_id = ? AND user_id = ?`, teamId, userId);
}

/** A private team is visible only to its members and invitees. */
export async function getTeam(ctx: AppContext, viewer: SessionUser | null, slug: string) {
  const team = await one<TeamRow>(ctx.db, `SELECT * FROM teams WHERE slug = ?`, slug);
  if (!team) return null;
  const mine = viewer ? await membership(ctx, team.id, viewer.id) : null;
  if (team.visibility === "private" && !mine) return null;
  const members = await all<{ user_id: string; username: string; display_name: string; role: string; status: string }>(
    ctx.db,
    `SELECT u.id AS user_id, u.username, u.display_name, m.role, m.status FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = ? AND (m.status = 'active' OR ?) ORDER BY m.role DESC, u.username`,
    team.id,
    mine?.status === "active" ? 1 : 0,
  );
  return { team, members, viewerRole: mine?.status === "active" ? mine.role : null, viewerInvited: mine?.status === "invited" };
}

export async function listMyTeams(ctx: AppContext, userId: string) {
  return all<{ id: string; slug: string; name: string; description: string; visibility: string; role: string; status: string; members: number }>(
    ctx.db,
    `SELECT t.id, t.slug, t.name, t.description, t.visibility, m.role, m.status,
            (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id AND x.status = 'active') AS members
       FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY m.status, t.name`,
    userId,
  );
}

export async function inviteToTeam(ctx: AppContext, user: SessionUser, teamId: string, username: string): Promise<void> {
  const mine = await membership(ctx, teamId, user.id);
  if (!mine || mine.status !== "active") throw notFound("Team");
  if (mine.role !== "owner") throw forbidden("Only the team owner can invite members.");
  const target = await findUserByUsername(ctx, username);
  if (!target || (await isBlockedEitherWay(ctx, user.id, target.id))) throw notFound("Player");
  if (await membership(ctx, teamId, target.id)) throw conflict(`${target.username} is already a member or invited.`);
  const team = await one<{ name: string; slug: string }>(ctx.db, `SELECT name, slug FROM teams WHERE id = ?`, teamId);
  await run(
    ctx.db,
    `INSERT INTO team_members (team_id, user_id, role, status, invited_by, created_at) VALUES (?, ?, 'member', 'invited', ?, ?)`,
    teamId,
    target.id,
    user.id,
    ctx.now(),
  );
  await notify(ctx, target.id, { kind: "team.invite", title: `${user.displayName} invited you to ${team?.name}`, link: `/nexus/teams/${team?.slug}` });
}

export async function respondToInvite(ctx: AppContext, user: SessionUser, teamId: string, action: "accept" | "decline"): Promise<void> {
  const mine = await membership(ctx, teamId, user.id);
  if (!mine || mine.status !== "invited") throw notFound("Invitation");
  if (action === "accept") await run(ctx.db, `UPDATE team_members SET status = 'active' WHERE team_id = ? AND user_id = ?`, teamId, user.id);
  else await run(ctx.db, `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`, teamId, user.id);
}

export async function leaveTeam(ctx: AppContext, user: SessionUser, teamId: string): Promise<void> {
  const mine = await membership(ctx, teamId, user.id);
  if (!mine) throw notFound("Team");
  if (mine.role === "owner") throw badRequest("Owners cannot leave their team. Delete it instead.");
  await run(ctx.db, `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`, teamId, user.id);
}

export async function removeMember(ctx: AppContext, user: SessionUser, teamId: string, memberId: string): Promise<void> {
  const mine = await membership(ctx, teamId, user.id);
  if (!mine || mine.status !== "active") throw notFound("Team");
  if (mine.role !== "owner") throw forbidden("Only the team owner can remove members.");
  if (memberId === user.id) throw badRequest("Owners cannot remove themselves.");
  if (!(await run(ctx.db, `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`, teamId, memberId))) throw notFound("Member");
}

export async function deleteTeam(ctx: AppContext, user: SessionUser, teamId: string): Promise<void> {
  const n = await run(ctx.db, `DELETE FROM teams WHERE id = ? AND owner_id = ?`, teamId, user.id);
  if (!n) throw notFound("Team");
}
