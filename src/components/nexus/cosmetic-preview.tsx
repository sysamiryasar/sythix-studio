import { cn } from "@/lib/cn";

export interface PreviewCosmetic {
  category: string;
  preview_style: string;
}

function style(json: string): { primary?: string; secondary?: string } {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Procedural voxel-style website preview of a player's equipped cosmetics.
 * These are placeholder renderings for the SythiX website only — they do not
 * appear in vanilla Minecraft.
 */
export function CosmeticPreview({ loadout, size = 160, className }: { loadout: PreviewCosmetic[]; size?: number; className?: string }) {
  const by = Object.fromEntries(loadout.map((c) => [c.category, style(c.preview_style)]));
  const cape = by.cape;
  const head = by.headwear;
  const wings = by.wings;
  const aura = by.aura ?? by.body_effect;
  const particle = by.particle ?? by.trail;
  return (
    <svg viewBox="0 0 64 80" width={size} height={(size * 80) / 64} className={cn("pixelated", className)} role="img" aria-label="Cosmetic preview (placeholder rendering)">
      {aura && <ellipse cx="32" cy="44" rx="26" ry="34" fill={aura.primary} opacity="0.18" />}
      {wings && (
        <g fill={wings.primary} stroke={wings.secondary} strokeWidth="0.6">
          <path d="M22 28 L4 18 L6 44 L22 40 Z" />
          <path d="M42 28 L60 18 L58 44 L42 40 Z" />
        </g>
      )}
      {cape && <rect x="23" y="27" width="18" height="30" fill={cape.primary} stroke={cape.secondary} strokeWidth="1" />}
      {/* body */}
      <rect x="24" y="10" width="16" height="16" fill="#c69c6d" />
      <rect x="24" y="10" width="16" height="5" fill="#4a2f1b" />
      <rect x="27" y="18" width="3" height="2" fill="#1e3a8a" />
      <rect x="34" y="18" width="3" height="2" fill="#1e3a8a" />
      <rect x="24" y="26" width="16" height="22" fill="#0ea5b7" />
      <rect x="16" y="26" width="8" height="22" fill="#0e8fa0" />
      <rect x="40" y="26" width="8" height="22" fill="#0e8fa0" />
      <rect x="24" y="48" width="8" height="22" fill="#3730a3" />
      <rect x="32" y="48" width="8" height="22" fill="#312e81" />
      {head && <rect x="23" y="13" width="18" height="3" fill={head.primary} stroke={head.secondary ?? head.primary} strokeWidth="0.5" />}
      {particle && (
        <g fill={particle.primary}>
          <rect x="8" y="60" width="2" height="2" />
          <rect x="52" y="54" width="2" height="2" />
          <rect x="12" y="8" width="2" height="2" />
          <rect x="50" y="12" width="2" height="2" />
        </g>
      )}
    </svg>
  );
}
