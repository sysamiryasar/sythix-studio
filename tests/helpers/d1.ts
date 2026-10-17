// A D1-compatible adapter over node:sqlite so tests run the real SQL and migrations.
import { DatabaseSync } from "node:sqlite";

type V = string | number | bigint | null | Uint8Array;

class Stmt {
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
    private params: V[] = [],
  ) {}
  bind(...p: unknown[]) {
    return new Stmt(
      this.db,
      this.sql,
      p.map((x) => {
        if (x === undefined) throw new Error("D1_TYPE_ERROR: undefined bind");
        if (typeof x === "boolean") return x ? 1 : 0;
        return x as V;
      }),
    );
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results: rows.map((r) => ({ ...(r as object) }) as T), success: true, meta: {} };
  }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = this.db.prepare(this.sql).all(...this.params);
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
}

export function createD1() {
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
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return api as unknown as D1Database & { sqlite: DatabaseSync };
}
