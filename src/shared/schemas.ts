// Request validation shared by the API (authoritative) and forms (convenience).
import { z } from "zod";

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const LIMITS = {
  postBody: 2000,
  commentBody: 1000,
  messageBody: 4000,
  bio: 280,
  mediaPerPost: 4,
  imageBytes: 5 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024,
  avatarBytes: 2 * 1024 * 1024,
  groupMembers: 10,
} as const;

export const registerSchema = z.object({
  email: z.email("Enter a valid email address.").max(254).transform((v) => v.trim().toLowerCase()),
  username: z.string().trim().regex(USERNAME_RE, "Usernames are 3–20 letters, numbers or underscores."),
  displayName: z.string().trim().min(1, "Enter a display name.").max(40),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  turnstileToken: z.string().max(4096).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username.").max(254),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const ACCENTS = ["violet", "cyan", "magenta", "emerald", "amber"] as const;
export const BANNERS = ["aurora", "obsidian", "nebula", "grid"] as const;

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  bio: z.string().trim().max(LIMITS.bio),
  location: z.string().trim().max(60),
  website: z.union([z.literal(""), z.url({ protocol: /^https?$/, message: "Use an http(s) URL." }).max(200)]),
  pronouns: z.string().trim().max(30),
  accent: z.enum(ACCENTS),
  banner: z.enum(BANNERS),
});

export const privacySchema = z.object({
  profileVisibility: z.enum(["public", "followers", "private"]),
  dmPolicy: z.enum(["everyone", "followers", "nobody"]),
  allowMentions: z.boolean(),
  showActivity: z.boolean(),
});

export const DASHBOARD_WIDGETS = ["compose", "feed", "communities", "notifications", "trending", "areas"] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export const preferencesSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  reducedMotion: z.boolean(),
  navCollapsed: z.boolean(),
  dashboard: z.array(z.object({ id: z.enum(DASHBOARD_WIDGETS), visible: z.boolean() })).max(DASHBOARD_WIDGETS.length),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, "Use at least 10 characters.").max(200),
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") });

export const VISIBILITIES = ["public", "followers", "private"] as const;
export type PostVisibility = (typeof VISIBILITIES)[number] | "community";

export const createPostSchema = z
  .object({
    body: z.string().trim().max(LIMITS.postBody),
    visibility: z.enum(VISIBILITIES).default("public"),
    mediaIds: z.array(z.string().max(40)).max(LIMITS.mediaPerPost).default([]),
    communityId: z.string().max(40).optional(),
  })
  .refine((p) => p.body.length > 0 || p.mediaIds.length > 0, { message: "Write something or attach media.", path: ["body"] });

export const editPostSchema = z.object({ body: z.string().trim().min(1).max(LIMITS.postBody) });

export const REACTIONS = ["like", "fire", "gg", "wow", "heart"] as const;
export type ReactionKind = (typeof REACTIONS)[number];
export const REACTION_LABEL: Record<ReactionKind, string> = { like: "👍", fire: "🔥", gg: "🎮", wow: "😮", heart: "💜" };

export const commentSchema = z.object({ body: z.string().trim().min(1, "Write a comment.").max(LIMITS.commentBody), parentId: z.string().max(40).optional() });

export const REPORT_REASONS = ["spam", "harassment", "hate", "violence", "sexual_content", "impersonation", "misinformation", "other"] as const;
export const reportSchema = z.object({
  targetType: z.enum(["user", "post", "comment", "message", "community"]),
  targetId: z.string().max(40),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});

export const communitySchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "Use 3–32 lowercase letters, numbers or dashes."),
  description: z.string().trim().max(500).default(""),
  visibility: z.enum(["public", "private"]).default("public"),
});
export const communityUpdateSchema = communitySchema.omit({ slug: true }).partial();

export const channelSchema = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,30}$/, "Channel names use lowercase letters, numbers and dashes."),
  kind: z.enum(["text", "announcement", "voice"]).default("text"),
  topic: z.string().trim().max(200).default(""),
  minRole: z.enum(["member", "moderator", "admin"]).default("member"),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Message is empty.").max(LIMITS.messageBody),
  replyTo: z.string().max(40).optional(),
});

export const conversationSchema = z.object({
  usernames: z.array(z.string().trim().regex(USERNAME_RE)).min(1).max(LIMITS.groupMembers - 1),
  title: z.string().trim().max(60).optional(),
});
