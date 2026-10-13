import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { all, likePattern } from "@/lib/db/sql";
import { getModuleStates } from "@/modules/service";

export interface SearchResult {
  type: "project" | "item" | "asset" | "server" | "player" | "team" | "module" | "setting";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const SETTINGS: { id: string; title: string; href: string; keywords: string }[] = [
  { id: "account", title: "Account settings", href: "/settings", keywords: "display name email roles minecraft link" },
  { id: "security", title: "Security & sessions", href: "/settings/security", keywords: "password sessions sign out devices" },
  { id: "preferences", title: "Theme & preferences", href: "/settings/preferences", keywords: "dark light theme motion sidebar" },
  { id: "privacy", title: "Profile privacy", href: "/nexus", keywords: "visibility private friends public profile" },
  { id: "cosmetics", title: "Cosmetics", href: "/nexus/cosmetics", keywords: "cape wings aura loadout" },
  { id: "modules", title: "Module manager", href: "/studio/modules", keywords: "modules feature flags health" },
  { id: "updates", title: "Studio updates", href: "/studio/updates", keywords: "version changelog release" },
];

/**
 * Unified search. Every source is filtered by what the viewer may access:
 * workspace membership for projects/items/assets, server membership for
 * servers, visibility and blocks for players and teams.
 */
export async function search(ctx: AppContext, user: SessionUser, q: string): Promise<SearchResult[]> {
  const term = q.trim().slice(0, 64);
  if (term.length < 2) return [];
  const like = likePattern(term);
  const available = new Set((await getModuleStates(ctx)).filter((s) => s.available).map((s) => s.manifest.id));
  const results: SearchResult[] = [];

  if (available.has("forgeos")) {
    const [projects, items, assets] = await Promise.all([
      all<{ id: string; name: string; namespace: string; ws: string }>(
        ctx.db,
        `SELECT p.id, p.name, p.namespace, w.name AS ws FROM projects p JOIN workspace_memberships m ON m.workspace_id = p.workspace_id AND m.user_id = ? JOIN workspaces w ON w.id = p.workspace_id
          WHERE p.archived_at IS NULL AND (p.name LIKE ? ESCAPE '\\' OR p.namespace LIKE ? ESCAPE '\\') LIMIT 6`,
        user.id, like, like,
      ),
      all<{ id: string; name: string; identifier: string; project_id: string; project: string }>(
        ctx.db,
        `SELECT i.id, i.name, i.identifier, i.project_id, p.name AS project FROM items i JOIN projects p ON p.id = i.project_id
          JOIN workspace_memberships m ON m.workspace_id = p.workspace_id AND m.user_id = ?
          WHERE p.archived_at IS NULL AND (i.name LIKE ? ESCAPE '\\' OR i.identifier LIKE ? ESCAPE '\\') LIMIT 6`,
        user.id, like, like,
      ),
      all<{ id: string; name: string; kind: string; project_id: string; project: string }>(
        ctx.db,
        `SELECT a.id, a.name, a.kind, a.project_id, p.name AS project FROM assets a JOIN projects p ON p.id = a.project_id
          JOIN workspace_memberships m ON m.workspace_id = p.workspace_id AND m.user_id = ? WHERE a.name LIKE ? ESCAPE '\\' LIMIT 4`,
        user.id, like,
      ),
    ]);
    results.push(...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, subtitle: `Project · ${p.namespace} · ${p.ws}`, href: `/forge/${p.id}` })));
    results.push(...items.map((i) => ({ type: "item" as const, id: i.id, title: i.name, subtitle: `Item · ${i.identifier} · ${i.project}`, href: `/forge/${i.project_id}/items/${i.id}` })));
    results.push(...assets.map((a) => ({ type: "asset" as const, id: a.id, title: a.name, subtitle: `${a.kind === "model" ? "Model" : "Texture"} · ${a.project}`, href: `/forge/${a.project_id}/assets` })));
  }

  if (available.has("serveros")) {
    const servers = await all<{ id: string; name: string; software: string; mc_version: string }>(
      ctx.db,
      `SELECT s.id, s.name, s.software, s.mc_version FROM servers s JOIN server_memberships m ON m.server_id = s.id AND m.user_id = ?
        WHERE s.name LIKE ? ESCAPE '\\' OR s.address LIKE ? ESCAPE '\\' LIMIT 5`,
      user.id, like, like,
    );
    results.push(...servers.map((s) => ({ type: "server" as const, id: s.id, title: s.name, subtitle: `Server · ${s.software} ${s.mc_version}`, href: `/servers/${s.id}` })));
  }

  if (available.has("nexusid")) {
    const [players, teams] = await Promise.all([
      all<{ id: string; username: string; display_name: string; visibility: string }>(
        ctx.db,
        `SELECT u.id, u.username, u.display_name, p.visibility FROM users u JOIN player_profiles p ON p.user_id = u.id
          WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL AND (u.username LIKE ? ESCAPE '\\' OR (p.visibility = 'public' AND u.display_name LIKE ? ESCAPE '\\'))
            AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
          LIMIT 6`,
        like, like, user.id, user.id,
      ),
      all<{ id: string; slug: string; name: string }>(
        ctx.db,
        `SELECT t.id, t.slug, t.name FROM teams t WHERE t.name LIKE ? ESCAPE '\\'
          AND (t.visibility = 'public' OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = ?)) LIMIT 4`,
        like, user.id,
      ),
    ]);
    results.push(
      ...players.map((p) => ({
        type: "player" as const,
        id: p.id,
        title: p.visibility === "public" ? p.display_name : p.username,
        subtitle: `Player · @${p.username}`,
        href: `/u/${p.username}`,
      })),
    );
    results.push(...teams.map((t) => ({ type: "team" as const, id: t.id, title: t.name, subtitle: "Team", href: `/nexus/teams/${t.slug}` })));
  }

  const lower = term.toLowerCase();
  for (const s of (await getModuleStates(ctx)).filter((s) => `${s.manifest.name} ${s.manifest.description}`.toLowerCase().includes(lower))) {
    results.push({ type: "module", id: s.manifest.id, title: s.manifest.name, subtitle: `Module · v${s.manifest.version}`, href: s.available ? (s.manifest.nav[0]?.href ?? "/studio/modules") : "/studio/modules" });
  }
  for (const s of SETTINGS.filter((s) => `${s.title} ${s.keywords}`.toLowerCase().includes(lower))) {
    results.push({ type: "setting", id: s.id, title: s.title, subtitle: "Settings", href: s.href });
  }
  return results.slice(0, 30);
}
