import { route } from "@/lib/http/api";
import { notFound } from "@/lib/errors";
import { deleteEntity, upsertAbility, upsertItem, upsertSet } from "@/modules/forgeos/entities";
import { abilityInput, equipmentSetInput, itemInput } from "@/modules/forgeos/schema";

type P = { id: string; kind: string; entityId: string };
const KIND = { items: "item", abilities: "ability", sets: "set" } as const;

export const PUT = route<P>({ module: "forgeos" }, async ({ ctx, user, params, body }) => {
  if (params.kind === "items") return upsertItem(ctx, user, params.id, await body(itemInput), params.entityId);
  if (params.kind === "abilities") return upsertAbility(ctx, user, params.id, await body(abilityInput), params.entityId);
  if (params.kind === "sets") return upsertSet(ctx, user, params.id, await body(equipmentSetInput), params.entityId);
  throw notFound("Collection");
});

export const DELETE = route<P>({ module: "forgeos" }, async ({ ctx, user, params }) => {
  const kind = KIND[params.kind as keyof typeof KIND];
  if (!kind) throw notFound("Collection");
  await deleteEntity(ctx, user, params.id, kind, params.entityId);
  return { ok: true };
});
