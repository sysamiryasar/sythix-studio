import "server-only";
import { cache } from "react";
import type { SessionUser } from "./auth/session";
import { getServerContext } from "./auth/current";
import { unreadCount } from "./notifications";
import { getModuleStates } from "@/modules/service";
import { getPreferences, type Preferences } from "@/modules/studio/preferences";
import { resolveCurrentWorkspace } from "@/modules/studio/workspace";
import { platformCan } from "./authz/roles";
import type { ModuleNavItem } from "@/modules/types";
import type { WorkspaceSummary } from "./authz/check";

export interface ShellData {
  user: Pick<SessionUser, "id" | "username" | "displayName" | "email" | "platformRole" | "emailVerified">;
  prefs: Preferences;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  nav: (ModuleNavItem & { moduleId: string })[];
  unavailableModules: { id: string; name: string; reason: string }[];
  unread: number;
  isPlatformAdmin: boolean;
}

export const getShellData = cache(async (user: SessionUser): Promise<ShellData> => {
  const ctx = await getServerContext();
  const [prefs, ws, unread, states] = await Promise.all([
    getPreferences(ctx, user.id),
    resolveCurrentWorkspace(ctx, user),
    unreadCount(ctx, user.id),
    getModuleStates(ctx),
  ]);
  return {
    user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email, platformRole: user.platformRole, emailVerified: user.emailVerified },
    prefs,
    workspace: ws.current,
    workspaces: ws.all,
    nav: states.filter((s) => s.available).flatMap((s) => s.manifest.nav.map((n) => ({ ...n, moduleId: s.manifest.id }))),
    unavailableModules: states.filter((s) => !s.available).map((s) => ({ id: s.manifest.id, name: s.manifest.name, reason: s.reasons[0] ?? "Unavailable" })),
    unread,
    isPlatformAdmin: platformCan(user.platformRole, "platform.modules.manage"),
  };
});
