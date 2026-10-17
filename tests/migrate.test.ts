import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { applyPending, splitStatements } from "@worker/lib/migrate";
import { createD1 } from "./helpers/d1";

const real = () =>
  readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`migrations/${name}`, "utf8") }));

describe("runtime migrator", () => {
  it("splits SQL safely", () => {
    expect(splitStatements("-- a;\nCREATE TABLE a (x TEXT DEFAULT 'a;b'); /* c; */ INSERT INTO a VALUES ('it''s;');")).toHaveLength(2);
  });
  it("applies all migrations once, Wrangler-compatibly", async () => {
    const db = createD1();
    expect(await applyPending(db, real())).toEqual(real().map((m) => m.name));
    expect(await applyPending(db, real())).toEqual([]);
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM d1_migrations`).get()).toEqual({ n: real().length });
  });
  it("rolls back a failing migration", async () => {
    const db = createD1();
    await expect(applyPending(db, [{ name: "0001_bad.sql", sql: "CREATE TABLE t (x INT); INSERT INTO nope VALUES (1);" }])).rejects.toThrow();
    expect(db.sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 't'`).get()).toBeUndefined();
  });
});
