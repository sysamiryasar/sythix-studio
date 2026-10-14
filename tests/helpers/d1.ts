// A D1Database-compatible adapter over node:sqlite, used only by tests so the
// real migrations and real SQL run exactly as they do on Cloudflare D1.
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Bindable = string | number | bigint | null | Uint8Array;

function normalize(params: unknown[]): Bindable[] {
  return params.map((p) => {
    if (p === undefined) throw new Error("D1_TYPE_ERROR: undefined is not a valid bind value");
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof ArrayBuffer) return new Uint8Array(p);
    return p as Bindable;
  });
}

class Stmt {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: Bindable[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, normalize(params));
  }
  private prepared(): StatementSync {
    return this.db.prepare(this.sql);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.prepared().get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.prepared().all(...this.params) as T[];
    return { results: rows.map((r) => ({ ...(r as object) }) as T), success: true, meta: {} };
  }
  async run() {
    const s = this.prepared();
    if (/\breturning\b/i.test(this.sql)) {
      const rows = s.all(...this.params);
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const r = s.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() {
    return (this.prepared().all(...this.params) as Record<string, unknown>[]).map((r) => Object.values(r));
  }
}

export function createTestD1(): D1Database & { sqlite: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const api = {
    sqlite: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
    withSession: () => api,
  };
  return api as unknown as D1Database & { sqlite: DatabaseSync };
}

/** Applies migrations/*.sql in order and records them in d1_migrations like Wrangler does. */
export function applyMigrations(db: DatabaseSync): string[] {
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`);
  for (const f of files) {
    db.exec(readFileSync(path.join(dir, f), "utf8"));
    db.prepare(`INSERT INTO d1_migrations (name) VALUES (?)`).run(f);
  }
  return files;
}
