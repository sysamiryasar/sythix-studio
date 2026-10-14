import type { AppContext } from "@/lib/context";
import { AppError, conflict } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { one, run } from "@/lib/db/sql";
import { bytesToBase64Url, randomToken, sha256Hex } from "@/lib/security/crypto";
import { recordAudit } from "@/lib/audit";
import { log } from "@/lib/logger";

// Minecraft Java account verification through the official sign-in chain:
//   Microsoft OAuth 2.0 (PKCE) -> Xbox Live user token -> XSTS token
//   -> Minecraft services login -> Minecraft profile (UUID + name).
// The user authenticates with Microsoft directly; SythiX never sees a password.
// Only the resulting public UUID and name are stored — every token is discarded.
//
// Requirements (see docs/MINECRAFT-LINKING.md): an Azure app registration with
// MS_CLIENT_ID/MS_CLIENT_SECRET and Mojang approval for Minecraft API access.

const AUTHORIZE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_URL = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";
const STATE_TTL_MS = 10 * 60_000;

export function linkingConfigured(env: CloudflareEnv): boolean {
  return !!env.MS_CLIENT_ID && !!env.MS_CLIENT_SECRET;
}

function redirectUri(ctx: AppContext) {
  return new URL("/api/v1/nexus/minecraft/callback", ctx.env.APP_URL ?? "http://localhost:3000").toString();
}

export async function startLink(ctx: AppContext, userId: string): Promise<string> {
  if (!linkingConfigured(ctx.env)) throw new AppError("unavailable", "Minecraft account linking is not configured on this installation.");
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  await run(ctx.db, `DELETE FROM oauth_states WHERE expires_at < ?`, ctx.now());
  await run(
    ctx.db,
    `INSERT INTO oauth_states (state_hash, user_id, provider, code_verifier, expires_at, created_at) VALUES (?, ?, 'minecraft_java', ?, ?, ?)`,
    await sha256Hex(state),
    userId,
    verifier,
    ctx.now() + STATE_TTL_MS,
    ctx.now(),
  );
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: ctx.env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(ctx),
    response_mode: "query",
    scope: "XboxLive.signin offline_access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

async function postJson<T>(url: string, body: unknown, step: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log("warn", "minecraft_link.step_failed", { step, status: res.status });
    if (step === "xsts" && text.includes("2148916233")) throw new AppError("bad_request", "This Microsoft account has no Xbox profile. Sign in to minecraft.net once, then try again.");
    if (step === "xsts" && text.includes("2148916238")) throw new AppError("bad_request", "Child accounts must be added to a Microsoft family before linking.");
    throw new AppError("bad_request", `Microsoft sign-in failed at the ${step} step.`);
  }
  return (await res.json()) as T;
}

export async function completeLink(ctx: AppContext, sessionUserId: string, code: string, state: string): Promise<{ name: string; uuid: string }> {
  const stateHash = await sha256Hex(state);
  const row = await one<{ user_id: string; code_verifier: string }>(
    ctx.db,
    `SELECT user_id, code_verifier FROM oauth_states WHERE state_hash = ? AND expires_at > ?`,
    stateHash,
    ctx.now(),
  );
  await run(ctx.db, `DELETE FROM oauth_states WHERE state_hash = ?`, stateHash);
  if (!row || row.user_id !== sessionUserId) throw new AppError("bad_request", "This sign-in attempt has expired. Please try again.");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ctx.env.MS_CLIENT_ID!,
      client_secret: ctx.env.MS_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(ctx),
      code_verifier: row.code_verifier,
    }),
  });
  if (!tokenRes.ok) throw new AppError("bad_request", "Microsoft sign-in failed at the token step.");
  const { access_token: msToken } = (await tokenRes.json()) as { access_token: string };

  const xbl = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    XBL_URL,
    { Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msToken}` }, RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT" },
    "xbox",
  );
  const uhs = xbl.DisplayClaims.xui[0]?.uhs;
  const xsts = await postJson<{ Token: string }>(
    XSTS_URL,
    { Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] }, RelyingParty: "rp://api.minecraftservices.com/", TokenType: "JWT" },
    "xsts",
  );
  const mc = await postJson<{ access_token: string }>(MC_LOGIN_URL, { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` }, "minecraft");
  const profileRes = await fetch(MC_PROFILE_URL, { headers: { authorization: `Bearer ${mc.access_token}` } });
  if (profileRes.status === 404) throw new AppError("bad_request", "This Microsoft account does not own Minecraft: Java Edition.");
  if (!profileRes.ok) throw new AppError("bad_request", "Could not read the Minecraft profile.");
  const profile = (await profileRes.json()) as { id: string; name: string };
  const uuid = profile.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5").toLowerCase();

  const taken = await one<{ user_id: string }>(ctx.db, `SELECT user_id FROM verified_identities WHERE provider = 'minecraft_java' AND provider_subject = ?`, uuid);
  if (taken && taken.user_id !== sessionUserId) throw conflict("That Minecraft account is already linked to another SythiX account.");
  await run(
    ctx.db,
    `INSERT INTO verified_identities (id, user_id, provider, provider_subject, provider_name, verified_at, created_at, updated_at)
     VALUES (?, ?, 'minecraft_java', ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET provider_subject = excluded.provider_subject, provider_name = excluded.provider_name,
       verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
    newId("idn"),
    sessionUserId,
    uuid,
    profile.name,
    ctx.now(),
    ctx.now(),
    ctx.now(),
  );
  await recordAudit(ctx, { actorId: sessionUserId, action: "identity.minecraft_linked", targetType: "user", targetId: sessionUserId, metadata: { uuid } });
  return { name: profile.name, uuid };
}

export async function unlink(ctx: AppContext, userId: string): Promise<void> {
  await run(ctx.db, `DELETE FROM verified_identities WHERE user_id = ? AND provider = 'minecraft_java'`, userId);
  await run(ctx.db, `UPDATE player_profiles SET avatar_source = 'initials' WHERE user_id = ?`, userId);
  await recordAudit(ctx, { actorId: userId, action: "identity.minecraft_unlinked", targetType: "user", targetId: userId });
}
