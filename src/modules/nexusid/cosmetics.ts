import { z } from "zod";
import type { AppContext } from "@/lib/context";
import { all, one, run } from "@/lib/db/sql";
import { badRequest, notFound } from "@/lib/errors";

export const COSMETIC_CATEGORIES = ["cape", "headwear", "wings", "body_effect", "trail", "aura", "particle", "profile_decoration"] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  cape: "Capes",
  headwear: "Headwear",
  wings: "Wings",
  body_effect: "Body effects",
  trail: "Trails",
  aura: "Auras",
  particle: "Particles",
  profile_decoration: "Profile decorations",
};

export interface CosmeticView {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  rarity: string;
  is_placeholder: number;
  preview_style: string;
  unlock: "starter" | "achievement" | "unavailable";
  unlock_achievement_name: string | null;
  owned: number;
  equipped: number;
}

export async function listCosmetics(ctx: AppContext, userId: string): Promise<CosmeticView[]> {
  return all<CosmeticView>(
    ctx.db,
    `SELECT d.id, d.category, d.name, d.description, d.rarity, d.is_placeholder, d.preview_style, d.unlock, a.name AS unlock_achievement_name,
            CASE WHEN i.cosmetic_id IS NULL THEN 0 ELSE 1 END AS owned,
            CASE WHEN l.cosmetic_id IS NULL THEN 0 ELSE 1 END AS equipped
       FROM cosmetic_definitions d
       LEFT JOIN achievements a ON a.id = d.unlock_achievement_id
       LEFT JOIN cosmetic_inventory i ON i.cosmetic_id = d.id AND i.user_id = ?
       LEFT JOIN cosmetic_loadout l ON l.cosmetic_id = d.id AND l.user_id = ?
      ORDER BY d.category, d.rarity`,
    userId,
    userId,
  );
}

export const loadoutInput = z.object({ category: z.enum(COSMETIC_CATEGORIES), cosmeticId: z.string().max(64).nullable() });

/** Equips an owned cosmetic (or clears the slot). Ownership is checked server-side. */
export async function setLoadout(ctx: AppContext, userId: string, input: z.infer<typeof loadoutInput>): Promise<void> {
  if (input.cosmeticId === null) {
    await run(ctx.db, `DELETE FROM cosmetic_loadout WHERE user_id = ? AND category = ?`, userId, input.category);
    return;
  }
  const c = await one<{ category: string; owned: number }>(
    ctx.db,
    `SELECT d.category, CASE WHEN i.cosmetic_id IS NULL THEN 0 ELSE 1 END AS owned
       FROM cosmetic_definitions d LEFT JOIN cosmetic_inventory i ON i.cosmetic_id = d.id AND i.user_id = ? WHERE d.id = ?`,
    userId,
    input.cosmeticId,
  );
  if (!c) throw notFound("Cosmetic");
  if (c.category !== input.category) throw badRequest("That cosmetic belongs to a different slot.");
  if (!c.owned) throw badRequest("You don't own that cosmetic yet.");
  await run(
    ctx.db,
    `INSERT INTO cosmetic_loadout (user_id, category, cosmetic_id) VALUES (?, ?, ?) ON CONFLICT(user_id, category) DO UPDATE SET cosmetic_id = excluded.cosmetic_id`,
    userId,
    input.category,
    input.cosmeticId,
  );
}
