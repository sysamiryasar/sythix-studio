import { jsonResponse, route } from "@/lib/http/api";
import { one } from "@/lib/db/sql";
import { RELEASE } from "@/generated/release";

/** Unauthenticated liveness probe. Reveals only version and database reachability. */
export const GET = route({ auth: "none" }, async ({ ctx }) => {
  let db = "ok";
  try {
    await one(ctx.db, "SELECT 1 AS ok");
  } catch {
    db = "error";
  }
  return jsonResponse({ status: db === "ok" ? "ok" : "degraded", version: RELEASE.version, db }, { status: db === "ok" ? 200 : 503 });
});
