// Applies the repository's reviewed D1 migrations at runtime, so a plain
// `wrangler deploy` (e.g. Cloudflare's Git integration) needs no extra step.
// Uses the same `d1_migrations` table as `wrangler d1 migrations apply`, so the
// two are interchangeable. Each migration runs in one D1 batch (a transaction)
// together with its bookkeeping row, so concurrent isolates cannot double-apply.

import { log } from "../logger";

export interface Migration {
  name: string;
  sql: string;
}

/** Splits SQL into statements, ignoring semicolons inside quotes and comments. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2; // doubled quote escape
          else break;
        } else j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const TABLE = `CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`;

async function appliedNames(db: D1Database): Promise<Set<string>> {
  const r = await db.prepare(`SELECT name FROM d1_migrations`).all<{ name: string }>();
  return new Set((r.results ?? []).map((x) => x.name));
}

/** Applies every migration not yet recorded. Returns the names applied by this call. */
export async function applyPendingMigrations(db: D1Database, migrations: readonly Migration[]): Promise<string[]> {
  await db.prepare(TABLE).run();
  let applied = await appliedNames(db);
  const done: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const statements = splitStatements(m.sql).map((s) => db.prepare(s));
    try {
      await db.batch([...statements, db.prepare(`INSERT INTO d1_migrations (name) VALUES (?)`).bind(m.name)]);
      done.push(m.name);
      log("info", "db.migration_applied", { name: m.name });
    } catch (err) {
      // Another isolate may have applied it concurrently; anything else is fatal.
      applied = await appliedNames(db);
      if (!applied.has(m.name)) {
        log("error", "db.migration_failed", { name: m.name, err });
        throw err;
      }
    }
  }
  return done;
}

let pending: Promise<unknown> | null = null;

/** Once per isolate: bring the database schema up to date. */
export function ensureMigrated(env: CloudflareEnv): Promise<unknown> {
  if (env.AUTO_MIGRATE === "off") return Promise.resolve();
  if (!pending) {
    pending = import("@/generated/migrations")
      .then(({ MIGRATIONS }) => applyPendingMigrations(env.DB, MIGRATIONS))
      .catch((err) => {
        pending = null; // retry on the next request
        throw err;
      });
  }
  return pending;
}
