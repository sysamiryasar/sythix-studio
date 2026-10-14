import { z } from "zod";

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "sythix", "support", "staff", "moderator", "mod",
  "api", "studio", "settings", "login", "register", "u", "nexus", "forge", "servers", "null", "undefined",
]);

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames need at least 3 characters.")
  .max(16, "Usernames can be at most 16 characters.")
  .regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers and underscores only.")
  .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), "That username is reserved.");

export const passwordSchema = z
  .string()
  .min(10, "Passwords need at least 10 characters.")
  .max(200, "Passwords can be at most 200 characters.");

export const displayNameSchema = z.string().trim().min(1, "Display name is required.").max(32);

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes.");

export const idSchema = z.string().regex(/^[a-z]{2,5}_[0-9a-z]{8,32}$/, "Invalid identifier.");

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "untitled";
}
