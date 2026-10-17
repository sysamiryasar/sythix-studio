// In-app changelog (Monthly Evolution). Newest first. Keep entries factual.
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  added: string[];
  changed?: string[];
  limitations?: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-10-17",
    title: "SythiX Unite foundation",
    added: [
      "SythiX ID: accounts, sessions, profile, privacy, appearance, data export and account deletion.",
      "Unified shell: navigation rail, global search, Everything Command (Ctrl/⌘+K), notifications, customizable Home.",
      "SythiX Social: posts with images and video, Home/Following/Discover feeds, follows, reactions, threaded comments, reposts, bookmarks, hashtags, trending, mentions.",
      "Safety: blocking, reporting, moderation queue, content hiding, account suspension, audit log.",
      "SythiX Connect: communities, channels, roles, invites, bans, direct and group messages with real-time delivery, typing and presence.",
    ],
    limitations: [
      "Voice and video calls are unavailable until a media server (SFU + TURN) is configured.",
      "Minecraft Database, Server Hosting, Gaming, AI, Worlds and Extensions are not built yet.",
    ],
  },
];
