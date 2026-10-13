import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { listUserWorkspaces, type WorkspaceSummary } from "@/lib/authz/check";
import { getPreferences } from "./preferences";

/** The workspace the user is currently working in (preference, falling back to their personal workspace). */
export async function resolveCurrentWorkspace(ctx: AppContext, user: SessionUser): Promise<{ current: WorkspaceSummary; all: WorkspaceSummary[] }> {
  const all = await listUserWorkspaces(ctx, user.id);
  const prefs = await getPreferences(ctx, user.id);
  const current = all.find((w) => w.id === prefs.defaultWorkspaceId) ?? all.find((w) => w.is_personal) ?? all[0];
  if (!current) throw new Error(`User ${user.id} has no workspace`);
  return { current, all };
}
