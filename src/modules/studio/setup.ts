export interface SetupItem {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
}

/** Optional integrations and what is missing without them. Shown to platform admins. */
export function setupChecklist(env: CloudflareEnv): SetupItem[] {
  return [
    {
      key: "email",
      ok: !!env.RESEND_API_KEY,
      title: "Email delivery",
      detail: env.RESEND_API_KEY
        ? "Verification and reset emails are sent through Resend."
        : "No provider: new accounts must be verified by a platform owner in Studio → Users, and password reset emails are not delivered. Set RESEND_API_KEY and EMAIL_FROM.",
    },
    {
      key: "turnstile",
      ok: !!env.TURNSTILE_SECRET_KEY && !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      title: "Bot protection (Turnstile)",
      detail:
        env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
          ? "Sign-up and password reset require a Turnstile challenge."
          : "Off: sign-up and reset rely on rate limits only. Set TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY.",
    },
    {
      key: "minecraft",
      ok: !!env.MS_CLIENT_ID && !!env.MS_CLIENT_SECRET,
      title: "Minecraft account linking",
      detail: env.MS_CLIENT_ID ? "Microsoft app configured." : "Optional. Requires an approved Microsoft app (docs/MINECRAFT-LINKING.md).",
    },
  ];
}
