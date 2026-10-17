// Thin typed helpers over D1. All SQL is parameterised; never interpolate input.

export type Bind = string | number | null;

export async function one<T>(db: D1Database, sql: string, ...params: Bind[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function all<T>(db: D1Database, sql: string, ...params: Bind[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all<T>();
  return r.results ?? [];
}

/** Runs a statement; returns the number of changed rows. */
export async function run(db: D1Database, sql: string, ...params: Bind[]): Promise<number> {
  const r = await db.prepare(sql).bind(...params).run();
  return r.meta?.changes ?? 0;
}

export function stmt(db: D1Database, sql: string, ...params: Bind[]): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

/** `LIKE` pattern with user input escaped (use with ESCAPE '\'). */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Placeholders for an IN (...) list. */
export function inList(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Opaque keyset cursor: "<created_at>:<id>". */
export function encodeCursor(createdAt: number, id: string): string {
  return btoa(`${createdAt}:${id}`).replace(/=+$/, "");
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: number; id: string } | null {
  if (!cursor) return null;
  try {
    const [ts, id] = atob(cursor).split(":");
    const createdAt = Number(ts);
    if (!Number.isFinite(createdAt) || !id || !/^[a-z]{2,4}_[A-Za-z0-9]+$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
