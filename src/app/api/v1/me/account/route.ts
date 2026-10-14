import { z } from "zod";
import { route } from "@/lib/http/api";
import { run } from "@/lib/db/sql";
import { displayNameSchema } from "@/lib/validation";

export const PATCH = route({}, async ({ ctx, user, body }) => {
  const { displayName } = await body(z.object({ displayName: displayNameSchema }));
  await run(ctx.db, `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, displayName, ctx.now(), user.id);
  return { displayName };
});
