import { route } from "@/lib/http/api";
import { notFound } from "@/lib/errors";
import { upsertAbility, upsertItem, upsertSet } from "@/modules/forgeos/entities";
import { abilityInput, equipmentSetInput, itemInput } from "@/modules/forgeos/schema";

type P = { id: string; kind: string };

export const POST = route<P>({ module: "forgeos" }, async ({ ctx, user, params, body }) => {
  if (params.kind === "items") return upsertItem(ctx, user, params.id, await body(itemInput));
  if (params.kind === "abilities") return upsertAbility(ctx, user, params.id, await body(abilityInput));
  if (params.kind === "sets") return upsertSet(ctx, user, params.id, await body(equipmentSetInput));
  throw notFound("Collection");
});
