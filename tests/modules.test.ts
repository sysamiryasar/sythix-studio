import { describe, expect, it } from "vitest";
import { MODULES } from "@/modules";
import { validateRegistry, dependentsOf } from "@/modules/registry";
import { createTestApp } from "./helpers/app";
import { getModuleStates, setModuleEnabled, assertModuleEnabled, runHealthChecks, isFlagEnabled, setFlag } from "@/modules/service";
import { defineModule } from "@/modules/types";
import { RELEASE } from "@/generated/release";

const base = { icon: "puzzle" as const, nav: [], permissions: [], migrations: [], featureFlags: [], platform: ">=0.1.0 <1.0.0" };

describe("module registry", () => {
  it("first-party registry is valid", () => {
    expect(validateRegistry(MODULES, RELEASE.version).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("detects missing dependencies, version mismatches, cycles and incompatibility", () => {
    const a = defineModule({ ...base, id: "alpha", name: "A", description: "", version: "1.0.0", dependencies: { beta: "^2.0.0" } });
    const b = defineModule({ ...base, id: "beta", name: "B", description: "", version: "1.5.0", dependencies: { alpha: "^1.0.0" } });
    const c = defineModule({ ...base, id: "gamma", name: "C", description: "", version: "1.0.0", dependencies: { missing: "*" }, platform: ">=5.0.0" });
    const msgs = validateRegistry([a, b, c], "0.1.0").map((i) => i.message).join("\n");
    expect(msgs).toMatch(/Requires beta@\^2\.0\.0, found 1\.5\.0/);
    expect(msgs).toMatch(/Missing dependency "missing"/);
    expect(msgs).toMatch(/Dependency cycle/);
    expect(msgs).toMatch(/Requires platform >=5\.0\.0/);
    expect(dependentsOf([a, b], "alpha")).toContain("beta");
  });
});

describe("module runtime state", () => {
  it("registers modules, gates disabled modules and protects core", async () => {
    const app = createTestApp();
    const states = await getModuleStates(app.ctx);
    expect(states.every((s) => s.available)).toBe(true);
    await expect(setModuleEnabled(app.ctx, "usr_x", "studio", false)).rejects.toMatchObject({ code: "bad_request" });
    await setModuleEnabled(app.ctx, "usr_x", "serveros", false);
    const fresh = { ...app.ctx };
    await expect(assertModuleEnabled(fresh, "serveros")).rejects.toMatchObject({ code: "module_disabled" });
    await assertModuleEnabled(fresh, "forgeos");
  });

  it("marks modules unavailable when their migration is missing", async () => {
    const app = createTestApp();
    app.db.sqlite.exec(`DELETE FROM d1_migrations WHERE name = '0004_forgeos.sql'`);
    const s = (await getModuleStates(app.ctx)).find((x) => x.manifest.id === "forgeos")!;
    expect(s.available).toBe(false);
    expect(s.reasons.join()).toMatch(/0004_forgeos\.sql/);
  });

  it("isolates health check results per module", async () => {
    const app = createTestApp();
    await runHealthChecks(app.ctx);
    const states = await getModuleStates({ ...app.ctx });
    expect(states.find((s) => s.manifest.id === "studio")?.health.status).toBe("healthy");
    expect(states.find((s) => s.manifest.id === "forgeos")?.health.status).toBe("healthy");
  });

  it("resolves feature flags with defaults and overrides", async () => {
    const app = createTestApp();
    expect(await isFlagEnabled(app.ctx, "nexusid.minecraft-linking")).toBe(false);
    await setFlag(app.ctx, "usr_x", "nexusid.minecraft-linking", true);
    expect(await isFlagEnabled(app.ctx, "nexusid.minecraft-linking")).toBe(true);
    expect(await isFlagEnabled(app.ctx, "unknown.flag")).toBe(false);
  });
});
