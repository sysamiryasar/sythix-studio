import { route } from "@/lib/http/api";
import { loadoutInput, setLoadout } from "@/modules/nexusid/cosmetics";

export const PUT = route({ module: "nexusid" }, async ({ ctx, user, body }) => {
  await setLoadout(ctx, user.id, await body(loadoutInput));
  return { ok: true };
});
