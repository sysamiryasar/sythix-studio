import { cn } from "@/lib/cn";

/** Initials avatar, or the player's Minecraft head when a verified Minecraft identity is linked. */
export function Avatar({ name, minecraftUuid, size = 32, accent = "#8b5cf6", className }: { name: string; minecraftUuid?: string | null; size?: number; accent?: string; className?: string }) {
  if (minecraftUuid) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://mc-heads.net/avatar/${encodeURIComponent(minecraftUuid)}/${size * 2}`}
        alt={`${name}'s Minecraft avatar`}
        width={size}
        height={size}
        className={cn("pixelated rounded-md", className)}
      />
    );
  }
  const initials = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+|_/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${accent}, #1e1b4b)` }}
    >
      {initials}
    </span>
  );
}
