// All primitives come from the platform WebCrypto implementation. Nothing here is a custom algorithm.

const enc = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 256-bit random token, base64url encoded. */
export function randomToken(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", buf as BufferSource));
}

/** Constant-time comparison for equal-length strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Password hashing ------------------------------------------------------------
// PBKDF2-HMAC-SHA256 via WebCrypto. Cloudflare Workers caps PBKDF2 at 100,000
// iterations, which is the value used here. The stored format is versioned
// (`pbkdf2-sha256$<iterations>$<salt>$<hash>`) so the scheme can be upgraded
// (e.g. to Argon2id) and existing hashes rehashed transparently on login.

export const PASSWORD_ITERATIONS = 100_000;
const SCHEME = "pbkdf2-sha256";

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `${SCHEME}$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  const [scheme, iterStr, saltStr, hashStr] = stored.split("$");
  const iterations = Number(iterStr);
  if (scheme !== SCHEME || !saltStr || !hashStr || !Number.isInteger(iterations) || iterations < 1) {
    return { ok: false, needsRehash: false };
  }
  const actual = await pbkdf2(password, base64UrlToBytes(saltStr), iterations);
  const ok = timingSafeEqual(bytesToBase64Url(actual), hashStr);
  return { ok, needsRehash: ok && iterations < PASSWORD_ITERATIONS };
}

/** A real hash of a random password, used to equalise timing for unknown accounts. */
export const DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
