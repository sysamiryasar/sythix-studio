// Thin typed helpers over D1. Every query is parameterised; never interpolate values into SQL.

export async function one<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>();
  return res.results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<number> {
  const res = await db.prepare(sql).bind(...params).run();
  return res.meta?.changes ?? 0;
}

export function stmt(db: D1Database, sql: string, ...params: unknown[]): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

/** Parse a JSON column, falling back to `fallback` for null or corrupt values. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Escape LIKE wildcards in user input; use with `ESCAPE '\\'`. */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
