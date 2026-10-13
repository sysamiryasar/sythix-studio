// Source of truth for the permission matrix used at runtime.
// migrations/0001_core.sql seeds the same matrix into `roles`/`role_permissions`
// for reporting and auditing; tests/authz.test.ts fails if they drift.

export const PLATFORM_ROLES = ["member", "platform_admin", "platform_owner"] as const;
export const WORKSPACE_ROLES = ["workspace_owner", "workspace_admin", "developer", "creator", "workspace_member"] as const;
export const SERVER_ROLES = ["server_admin", "server_moderator", "server_viewer"] as const;

export type PlatformRoleId = (typeof PLATFORM_ROLES)[number];
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type ServerRole = (typeof SERVER_ROLES)[number];

export type PlatformPermission =
  | "platform.modules.manage"
  | "platform.flags.manage"
  | "platform.reports.review"
  | "platform.users.manage"
  | "platform.audit.read";

export type WorkspacePermission =
  | "workspace.manage"
  | "workspace.members.manage"
  | "project.view"
  | "project.create"
  | "project.edit"
  | "project.delete"
  | "project.export"
  | "project.deploy.request"
  | "server.register"
  | "server.list"
  | "audit.read";

export type ServerPermission =
  | "server.view"
  | "server.manage"
  | "server.credentials.manage"
  | "server.members.manage"
  | "server.console.read"
  | "server.console.execute"
  | "server.players.moderate"
  | "server.plugins.read"
  | "server.plugins.manage"
  | "server.deploy"
  | "server.audit.read";

export const PLATFORM_MATRIX: Record<PlatformRoleId, readonly PlatformPermission[]> = {
  member: [],
  platform_admin: ["platform.modules.manage", "platform.flags.manage", "platform.reports.review", "platform.audit.read"],
  platform_owner: ["platform.modules.manage", "platform.flags.manage", "platform.reports.review", "platform.users.manage", "platform.audit.read"],
};

const PROJECT_ALL: WorkspacePermission[] = ["project.view", "project.create", "project.edit", "project.delete", "project.export", "project.deploy.request"];

export const WORKSPACE_MATRIX: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  workspace_owner: ["workspace.manage", "workspace.members.manage", ...PROJECT_ALL, "server.register", "server.list", "audit.read"],
  workspace_admin: ["workspace.members.manage", ...PROJECT_ALL, "server.register", "server.list", "audit.read"],
  developer: ["project.view", "project.create", "project.edit", "project.export", "project.deploy.request", "server.list"],
  creator: ["project.view", "project.create", "project.edit", "project.export"],
  workspace_member: ["project.view"],
};

export const SERVER_MATRIX: Record<ServerRole, readonly ServerPermission[]> = {
  server_admin: [
    "server.view", "server.manage", "server.credentials.manage", "server.members.manage", "server.console.read",
    "server.console.execute", "server.players.moderate", "server.plugins.read", "server.plugins.manage", "server.deploy", "server.audit.read",
  ],
  server_moderator: ["server.view", "server.console.read", "server.players.moderate", "server.plugins.read"],
  server_viewer: ["server.view"],
};

export const ROLE_LABELS: Record<PlatformRoleId | WorkspaceRole | ServerRole, string> = {
  member: "Member",
  platform_admin: "Platform administrator",
  platform_owner: "Platform owner",
  workspace_owner: "Workspace owner",
  workspace_admin: "Workspace administrator",
  developer: "Developer",
  creator: "Creator",
  workspace_member: "Workspace member",
  server_admin: "Server administrator",
  server_moderator: "Server moderator",
  server_viewer: "Server viewer",
};

export function platformCan(role: PlatformRoleId, p: PlatformPermission): boolean {
  return PLATFORM_MATRIX[role]?.includes(p) ?? false;
}
export function workspaceCan(role: WorkspaceRole | null | undefined, p: WorkspacePermission): boolean {
  return !!role && (WORKSPACE_MATRIX[role]?.includes(p) ?? false);
}
export function serverCan(role: ServerRole | null | undefined, p: ServerPermission): boolean {
  return !!role && (SERVER_MATRIX[role]?.includes(p) ?? false);
}
