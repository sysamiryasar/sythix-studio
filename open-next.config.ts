import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache is configured: every SythiX page is per-user and dynamic.
export default defineCloudflareConfig({});
