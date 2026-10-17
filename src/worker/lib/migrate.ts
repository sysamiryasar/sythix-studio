// Applies bundled D1 migrations on first use, using Wrangler's `d1_migrations`
// table so `wrangler d1 migrations apply` stays compatible.
import type { Env } from "../env";

export interface Migration {
  name: string;
  sql: string;
}

/** Splits SQL into statements, respecting quotes and comments. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let quote: string | null = null;
  while (i < sql.length) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (quote) {
      cur += c;
      if (c === quote) {
        if (next === quote) {
          cur += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }
    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
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

async function applied(db: D1Database): Promise<Set<string>> {
  const r = await db.prepare(`SELECT name FROM d1_migrations`).all<{ name: string }>();
  return new Set((r.results ?? []).map((x) => x.name));
}

export async function applyPending(db: D1Database, migrations: readonly Migration[]): Promise<string[]> {
  await db.prepare(TABLE).run();
  let done = await applied(db);
  const ran: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    try {
      await db.batch([...splitStatements(m.sql).map((s) => db.prepare(s)), db.prepare(`INSERT INTO d1_migrations (name) VALUES (?)`).bind(m.name)]);
      ran.push(m.name);
    } catch (err) {
      // Another isolate may have applied it at the same moment.
      done = await applied(db);
      if (!done.has(m.name)) throw err;
    }
  }
  return ran;
}

let pending: Promise<unknown> | null = null;

/** Once per isolate. Retries on the next request after a failure. */
export function ensureMigrated(env: Env): Promise<unknown> {
  if (env.AUTO_MIGRATE === "off") return Promise.resolve();
  pending ??= import("../generated/migrations")
    .then(({ MIGRATIONS }) => applyPending(env.DB, MIGRATIONS))
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Test hook. */
export function resetMigrationState() {
  pending = null;
}
