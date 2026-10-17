// Role and permission model shared by the API (enforcement) and the UI (display only).
// The server never trusts a client's claim about roles: it always re-reads them.

export const PLATFORM_ROLES = ["member", "moderator", "admin", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const PLATFORM_PERMS = {
  "moderation.review": "moderator",
  "moderation.hide_content": "moderator",
  "users.suspend": "admin",
  "users.set_role": "owner",
  "platform.audit": "admin",
} as const satisfies Record<string, PlatformRole>;
export type PlatformPermission = keyof typeof PLATFORM_PERMS;

export function platformRank(role: PlatformRole): number {
  return PLATFORM_ROLES.indexOf(role);
}

export function platformCan(role: PlatformRole, perm: PlatformPermission): boolean {
  return platformRank(role) >= platformRank(PLATFORM_PERMS[perm]);
}

export const COMMUNITY_ROLES = ["member", "moderator", "admin", "owner"] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

const COMMUNITY_PERMS = {
  "community.view": "member",
  "message.send": "member",
  "invite.create": "member",
  "message.pin": "moderator",
  "message.delete_any": "moderator",
  "member.kick": "moderator",
  "member.ban": "admin",
  "member.set_role": "admin",
  "channel.manage": "admin",
  "community.manage": "admin",
  "community.delete": "owner",
} as const satisfies Record<string, CommunityRole>;
export type CommunityPermission = keyof typeof COMMUNITY_PERMS;

export function communityRank(role: CommunityRole): number {
  return COMMUNITY_ROLES.indexOf(role);
}

export function communityCan(role: CommunityRole | null | undefined, perm: CommunityPermission): boolean {
  if (!role) return false;
  return communityRank(role) >= communityRank(COMMUNITY_PERMS[perm]);
}

/** A member may only act on members ranked strictly below them. */
export function outranks(actor: CommunityRole, target: CommunityRole): boolean {
  return communityRank(actor) > communityRank(target);
}
