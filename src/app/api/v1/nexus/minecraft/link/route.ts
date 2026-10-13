import { route } from "@/lib/http/api";
import { startLink } from "@/modules/nexusid/minecraft";
import { isFlagEnabled } from "@/modules/service";
import { AppError } from "@/lib/errors";

export const GET = route({ module: "nexusid" }, async ({ ctx, user }) => {
  if (!(await isFlagEnabled(ctx, "nexusid.minecraft-linking"))) throw new AppError("unavailable", "Minecraft linking is disabled.");
  return Response.redirect(await startLink(ctx, user.id), 302);
});
