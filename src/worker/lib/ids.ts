const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random, URL-safe id with a type prefix, e.g. `pst_k3j9...` (16 chars of entropy ≈ 82 bits). */
export function newId(prefix: string, len = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 36];
  return `${prefix}_${out}`;
}

/** URL-safe random token for secrets (sessions, invites). */
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
