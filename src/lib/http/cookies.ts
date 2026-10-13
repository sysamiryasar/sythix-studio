export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[k] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict"; path?: string; expires?: Date; maxAge?: number },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`];
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite === "lax" ? "Lax" : "Strict"}`);
  return parts.join("; ");
}
