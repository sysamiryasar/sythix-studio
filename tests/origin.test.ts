import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/security/origin";

const req = (headers: Record<string, string>, method = "POST", url = "http://internal.invalid/api/x") => new Request(url, { method, headers });

describe("CSRF origin check", () => {
  it("allows safe methods without origin", () => {
    expect(() => assertSameOrigin(req({}, "GET"))).not.toThrow();
  });
  it("accepts matching Host or APP_URL origins", () => {
    expect(() => assertSameOrigin(req({ host: "studio.example", origin: "https://studio.example" }))).not.toThrow();
    expect(() => assertSameOrigin(req({ origin: "https://app.example" }), "https://app.example")).not.toThrow();
  });
  it("rejects foreign or missing origins", () => {
    expect(() => assertSameOrigin(req({ host: "studio.example", origin: "https://evil.example" }))).toThrow(/Cross-origin/);
    expect(() => assertSameOrigin(req({ host: "studio.example" }))).toThrow(/Missing request origin/);
    expect(() => assertSameOrigin(req({ host: "studio.example", referer: "https://evil.example/x" }))).toThrow();
  });
});
