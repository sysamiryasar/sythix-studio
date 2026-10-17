// The SythiX Unite product areas and their honest build status.
// "live" = usable in this build; "planned" = scheduled milestone, not built;
// "needs-infra" = cannot work until external infrastructure is configured.

export type AreaStatus = "live" | "partial" | "planned" | "needs-infra";

export interface ProductArea {
  id: string;
  name: string;
  short: string;
  description: string;
  href: string;
  status: AreaStatus;
  milestone: number;
  /** What exists today, stated plainly. */
  today: string;
  /** What is required before this area can be completed. */
  requires?: string[];
}

export const PRODUCT_AREAS: readonly ProductArea[] = [
  {
    id: "id",
    name: "SythiX ID",
    short: "ID",
    description: "One identity for every SythiX area: account, profile, privacy, sessions and data controls.",
    href: "/settings",
    status: "live",
    milestone: 1,
    today: "Registration, sign-in, sessions, profile, privacy, appearance, data export and account deletion.",
    requires: ["Passkeys/MFA and connected game accounts are planned."],
  },
  {
    id: "social",
    name: "SythiX Social",
    short: "Social",
    description: "Posts, media, follows, reactions, comments, reposts, bookmarks, hashtags and discovery.",
    href: "/social",
    status: "live",
    milestone: 2,
    today: "Persistent posts with images and video, three feeds, follows, reactions, threaded comments, reposts, bookmarks, hashtags, mentions, search, blocking and reporting.",
  },
  {
    id: "connect",
    name: "SythiX Connect",
    short: "Connect",
    description: "Communities with channels and roles, direct and group messages, real-time updates.",
    href: "/connect",
    status: "partial",
    milestone: 3,
    today: "Communities, text and announcement channels, roles, invites, moderation, direct/group messages, real-time delivery, typing and presence.",
    requires: [
      "Voice, video and screen sharing need a WebRTC SFU and TURN service (e.g. Cloudflare Realtime). Not configured — calls are unavailable, never simulated.",
      "Forums and threads are planned.",
    ],
  },
  {
    id: "minecraft",
    name: "Minecraft Database",
    short: "Minecraft",
    description: "Player profiles, server directory, live status checks and verifiable leaderboards.",
    href: "/areas/minecraft",
    status: "planned",
    milestone: 4,
    today: "Not built yet.",
    requires: ["Java Edition first. Player identity via official Mojang/Microsoft services only; no invented statistics."],
  },
  {
    id: "hosting",
    name: "Server Hosting",
    short: "Hosting",
    description: "Minecraft server management through a provider adapter and a scoped agent.",
    href: "/areas/hosting",
    status: "needs-infra",
    milestone: 7,
    today: "Not built yet. A dashboard is not a hosting service.",
    requires: [
      "Real compute, storage and networking for game servers (not Cloudflare Workers).",
      "A provisioning backend such as a Pterodactyl panel or a controlled self-hosted node with a scoped agent.",
      "Funding: public hosting cannot be offered for free.",
    ],
  },
  {
    id: "studio",
    name: "SythiX Studio",
    short: "Studio",
    description: "Projects, dashboard and theme customization, widgets, integrations and developer docs.",
    href: "/areas/studio",
    status: "planned",
    milestone: 6,
    today: "Dashboard widget layout (show/hide/reorder) is live on Home; the rest is planned.",
  },
  {
    id: "gaming",
    name: "SythiX Gaming",
    short: "Gaming",
    description: "Gaming identities, squads, tournaments and game integrations.",
    href: "/areas/gaming",
    status: "planned",
    milestone: 9,
    today: "Not built yet.",
  },
  {
    id: "ai",
    name: "SythiX AI",
    short: "AI",
    description: "Provider-independent assistant with permission-aware retrieval and approved actions.",
    href: "/areas/ai",
    status: "planned",
    milestone: 8,
    today: "Not built yet. The platform works fully without AI.",
    requires: ["An AI provider (optional, may incur cost — requires explicit approval)."],
  },
  {
    id: "worlds",
    name: "SythiX Worlds",
    short: "Worlds",
    description: "Immersive community experiences, events and interactive spaces.",
    href: "/areas/worlds",
    status: "planned",
    milestone: 10,
    today: "Not built yet.",
  },
  {
    id: "extensions",
    name: "SythiX Extensions",
    short: "Extensions",
    description: "Controlled extensions and integrations with explicit permission scopes.",
    href: "/areas/extensions",
    status: "planned",
    milestone: 10,
    today: "Not built yet. No third-party code is loaded.",
  },
];

export function areaById(id: string): ProductArea | undefined {
  return PRODUCT_AREAS.find((a) => a.id === id);
}
