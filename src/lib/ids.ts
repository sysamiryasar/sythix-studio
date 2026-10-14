const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-style base32, lowercase

/** Random, URL-safe identifier with a type prefix, e.g. `usr_3f9k...`. 80 bits of entropy. */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}
