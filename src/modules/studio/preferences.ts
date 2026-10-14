import { z } from "zod";
import type { AppContext } from "@/lib/context";
import { one, run } from "@/lib/db/sql";
import { workspaceRole } from "@/lib/authz/check";
import { notFound } from "@/lib/errors";

export interface Preferences {
  theme: "dark" | "light" | "system";
  sidebarCollapsed: boolean;
  reducedMotion: boolean;
  defaultWorkspaceId: string | null;
}

export const preferencesInput = z
  .object({
    theme: z.enum(["dark", "light", "system"]),
    sidebarCollapsed: z.boolean(),
    reducedMotion: z.boolean(),
    defaultWorkspaceId: z.string().max(64),
  })
  .partial();

export async function getPreferences(ctx: AppContext, userId: string): Promise<Preferences> {
  const r = await one<{ theme: Preferences["theme"]; sidebar_collapsed: number; reduced_motion: number; default_workspace_id: string | null }>(
    ctx.db,
    `SELECT theme, sidebar_collapsed, reduced_motion, default_workspace_id FROM user_preferences WHERE user_id = ?`,
    userId,
  );
  return {
    theme: r?.theme ?? "dark",
    sidebarCollapsed: r?.sidebar_collapsed === 1,
    reducedMotion: r?.reduced_motion === 1,
    defaultWorkspaceId: r?.default_workspace_id ?? null,
  };
}

export async function updatePreferences(ctx: AppContext, userId: string, patch: z.infer<typeof preferencesInput>): Promise<Preferences> {
  if (patch.defaultWorkspaceId && !(await workspaceRole(ctx, userId, patch.defaultWorkspaceId))) throw notFound("Workspace");
  const cur = await getPreferences(ctx, userId);
  const next = { ...cur, ...patch };
  await run(
    ctx.db,
    `INSERT INTO user_preferences (user_id, theme, sidebar_collapsed, reduced_motion, default_workspace_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, sidebar_collapsed = excluded.sidebar_collapsed,
       reduced_motion = excluded.reduced_motion, default_workspace_id = excluded.default_workspace_id, updated_at = excluded.updated_at`,
    userId,
    next.theme,
    next.sidebarCollapsed ? 1 : 0,
    next.reducedMotion ? 1 : 0,
    next.defaultWorkspaceId,
    ctx.now(),
  );
  return next;
}
