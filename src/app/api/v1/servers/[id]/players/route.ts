import { z } from "zod";
import { route } from "@/lib/http/api";
import { newId } from "@/lib/ids";
import { run } from "@/lib/db/sql";
import { getPlayers } from "@/modules/serveros/reads";
import { queueCommand } from "@/modules/serveros/commands";

type P = { id: string };
export const GET = route<P>({ module: "serveros" }, async ({ ctx, user, params }) => getPlayers(ctx, user, params.id));

/** Kick, ban or unban. Recorded in moderation history and the audit log; executed only by a connected agent. */
export const POST = route<P>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const input = await body(z.object({ action: z.enum(["kick", "ban", "unban"]), player: z.string().max(16), reason: z.string().max(200).default(""), uuid: z.string().max(40).optional() }));
  const kind = input.action === "kick" ? "players.kick" : input.action === "ban" ? "players.ban" : "players.unban";
  const cmd = await queueCommand(ctx, user, params.id, kind, { player: input.player, reason: input.reason });
  await run(
    ctx.db,
    `INSERT INTO moderation_actions (id, server_id, player_name, player_uuid, action, reason, actor_id, command_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("mod"), params.id, input.player, input.uuid ?? null, input.action, input.reason, user.id, cmd.id, ctx.now(),
  );
  return cmd;
});
