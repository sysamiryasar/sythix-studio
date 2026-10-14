import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `buildCommand` keeps OpenNext from calling `pnpm run build` (which is
// itself `opennextjs-cloudflare build`) and recursing.
const config = { ...defineCloudflareConfig({}), buildCommand: "npx next build" };

export default config;
