import type { Ctx } from "../env";
import type { SearchResults } from "@shared/types";
import { all, likePattern } from "../lib/db";
import { enforce, LIMIT } from "../lib/rate-limit";
import { searchPosts, type Viewer } from "./social";
import { toSummary, USER_COLS, type UserRow } from "./users";
import { discoverCommunities } from "./connect";

/** Unified search. Every source applies the same visibility rules as its own pages. */
export async function search(ctx: Ctx, viewer: Viewer, raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 64);
  if (q.length < 2) return { users: [], posts: [], tags: [], communities: [] };
  await enforce(ctx, LIMIT.search, viewer.id);
  const term = q.replace(/^[@#]/, "");
  const like = likePattern(term);
  const [users, posts, tags, communities] = await Promise.all([
    all<UserRow>(
      ctx.db,
      `SELECT ${USER_COLS} FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE u.status = 'active' AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
        ORDER BY (u.username = ?) DESC, u.username LIMIT 8`,
      like,
      like,
      viewer.id,
      viewer.id,
      term,
    ),
    q.startsWith("@") ? Promise.resolve([]) : searchPosts(ctx, viewer, term, 10),
    all<{ tag: string; count: number }>(
      ctx.db,
      `SELECT t.tag, COUNT(*) AS count FROM post_tags t JOIN posts p ON p.id = t.post_id LEFT JOIN profiles ap ON ap.user_id = p.author_id
        WHERE t.tag LIKE ? ESCAPE '\\' AND p.status = 'visible' AND p.visibility = 'public' AND COALESCE(ap.profile_visibility, 'public') = 'public'
        GROUP BY t.tag ORDER BY count DESC LIMIT 8`,
      `${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    ),
    discoverCommunities(ctx, viewer, term),
  ]);
  return { users: users.map(toSummary), posts, tags, communities: communities.slice(0, 8) };
}
