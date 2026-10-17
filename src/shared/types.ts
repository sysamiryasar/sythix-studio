// API response shapes shared by the Worker and the client.
import type { PlatformRole, CommunityRole } from "./permissions";
import type { DashboardWidget, PostVisibility, ReactionKind } from "./schemas";

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  accent: string;
  avatarUrl: string | null;
}

export interface Me extends UserSummary {
  email: string;
  role: PlatformRole;
  createdAt: number;
  profile: {
    bio: string;
    location: string;
    website: string;
    pronouns: string;
    banner: string;
    profileVisibility: "public" | "followers" | "private";
    dmPolicy: "everyone" | "followers" | "nobody";
    allowMentions: boolean;
    showActivity: boolean;
  };
  preferences: {
    theme: "dark" | "light" | "system";
    reducedMotion: boolean;
    navCollapsed: boolean;
    dashboard: { id: DashboardWidget; visible: boolean }[];
  };
}

export interface ProfileView extends UserSummary {
  bio: string;
  location: string;
  website: string;
  pronouns: string;
  banner: string;
  createdAt: number;
  /** False when the viewer may only see the profile header (private / followers-only). */
  canViewContent: boolean;
  counts: { followers: number; following: number; posts: number };
  relationship: { isSelf: boolean; following: boolean; followsYou: boolean; blocked: boolean };
}

export interface MediaView {
  id: string;
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
}

export interface PostView {
  id: string;
  author: UserSummary;
  body: string;
  visibility: PostVisibility;
  media: MediaView[];
  createdAt: number;
  editedAt: number | null;
  counts: { reactions: number; comments: number; reposts: number };
  viewer: { reaction: ReactionKind | null; bookmarked: boolean; reposted: boolean; isAuthor: boolean };
  /** Present when this post is a repost; `body`/`media` are then empty. */
  repostOf: PostView | null;
  /** True when the original of a repost is no longer visible to the viewer. */
  unavailable?: boolean;
  hidden?: boolean;
}

export interface CommentView {
  id: string;
  postId: string;
  parentId: string | null;
  author: UserSummary;
  body: string;
  createdAt: number;
  deleted: boolean;
  canDelete: boolean;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  actor: UserSummary | null;
  readAt: number | null;
  createdAt: number;
}

export interface CommunitySummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  memberCount: number;
  myRole: CommunityRole | null;
}

export interface ChannelView {
  id: string;
  communityId: string;
  name: string;
  kind: "text" | "announcement" | "voice";
  topic: string;
  minRole: CommunityRole;
  canPost: boolean;
  unread: boolean;
}

export interface MessageView {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  author: UserSummary;
  body: string;
  replyTo: { id: string; author: string; body: string } | null;
  pinned: boolean;
  reactions: { emoji: string; count: number; mine: boolean }[];
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
}

export interface ConversationView {
  id: string;
  kind: "dm" | "group";
  title: string;
  members: UserSummary[];
  lastMessageAt: number | null;
  unread: boolean;
}

export type RealtimeEvent =
  | { type: "message.created"; message: MessageView }
  | { type: "message.updated"; message: MessageView }
  | { type: "message.deleted"; id: string }
  | { type: "typing"; user: { id: string; username: string } }
  | { type: "presence"; users: { id: string; username: string }[] }
  | { type: "notification"; unread: number };

export interface SearchResults {
  users: UserSummary[];
  posts: PostView[];
  tags: { tag: string; count: number }[];
  communities: CommunitySummary[];
}
