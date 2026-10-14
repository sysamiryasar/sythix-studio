import { z } from "zod";
import { route } from "@/lib/http/api";
import { AppError } from "@/lib/errors";
import { queueCommand } from "@/modules/serveros/commands";
import { isFlagEnabled } from "@/modules/service";

/** Plugin configuration operations, all executed and sandboxed by the agent. Writes always back up first. */
export const POST = route<{ id: string }>({ module: "serveros" }, async ({ ctx, user, params, body }) => {
  const input = await body(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("read"), plugin: z.string(), file: z.string() }),
      z.object({ action: z.literal("backups"), plugin: z.string(), file: z.string() }),
      z.object({ action: z.literal("write"), plugin: z.string(), file: z.string(), content: z.string(), expectedSha256: z.string() }),
      z.object({ action: z.literal("restore"), plugin: z.string(), file: z.string(), backupId: z.string() }),
    ]),
  );
  if ((input.action === "write" || input.action === "restore") && !(await isFlagEnabled(ctx, "serveros.config-editor"))) {
    throw new AppError("unavailable", "Configuration editing is disabled by a platform administrator.");
  }
  const { action, ...payload } = input;
  return queueCommand(ctx, user, params.id, `config.${action}` as "config.read", payload);
});
