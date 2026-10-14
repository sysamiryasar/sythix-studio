import semver from "semver";
import type { AppContext } from "@/lib/context";
import { RELEASE } from "@/generated/release";
import { log } from "@/lib/logger";

export interface UpdateCheck {
  status: "up_to_date" | "update_available" | "not_configured" | "unavailable";
  latest?: { version: string; url: string; publishedAt: string; name: string };
  detail: string;
}

/**
 * Checks the configured GitHub repository's latest release. Never installs
 * anything: upgrades happen only through the reviewed release workflow.
 */
export async function checkForUpdates(ctx: AppContext): Promise<UpdateCheck> {
  const repo = ctx.env.RELEASES_REPO;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { status: "not_configured", detail: "Set RELEASES_REPO (owner/repo) to check GitHub releases." };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "sythix-studio" } });
    if (res.status === 404) return { status: "unavailable", detail: "No published releases found (or the repository is private)." };
    if (!res.ok) return { status: "unavailable", detail: `GitHub returned ${res.status}.` };
    const r = (await res.json()) as { tag_name: string; html_url: string; published_at: string; name: string };
    const latest = semver.clean(r.tag_name) ?? r.tag_name;
    const info = { version: latest, url: r.html_url, publishedAt: r.published_at, name: r.name || r.tag_name };
    if (semver.valid(latest) && semver.gt(latest, RELEASE.version)) return { status: "update_available", latest: info, detail: `Version ${latest} is available.` };
    return { status: "up_to_date", latest: info, detail: "This installation runs the latest release." };
  } catch (err) {
    log("warn", "updates.check_failed", { err });
    return { status: "unavailable", detail: "Could not reach GitHub." };
  }
}
