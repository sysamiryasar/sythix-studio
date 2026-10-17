import { defineConfig } from "@playwright/test";

// Runs against a real `wrangler dev` (workerd + local D1/R2/Durable Objects).
// Start it first: `pnpm build && pnpm exec wrangler dev --port 8787`, or set E2E_BASE_URL.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8787",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
