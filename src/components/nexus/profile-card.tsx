import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export const BANNERS: Record<string, { label: string; className: string }> = {
  obsidian: { label: "Obsidian", className: "bg-[radial-gradient(120%_120%_at_0%_0%,#2e1065_0%,#0b0b12_55%)]" },
  nether: { label: "Nether", className: "bg-[radial-gradient(120%_120%_at_0%_0%,#7f1d1d_0%,#1c0a0a_60%)]" },
  end: { label: "The End", className: "bg-[radial-gradient(120%_120%_at_100%_0%,#6b21a8_0%,#0f0a1f_55%)]" },
  ocean: { label: "Ocean", className: "bg-[radial-gradient(120%_120%_at_0%_100%,#0e7490_0%,#071a26_60%)]" },
  deepslate: { label: "Deepslate", className: "bg-[linear-gradient(135deg,#334155_0%,#0f172a_70%)]" },
  amethyst: { label: "Amethyst", className: "bg-[linear-gradient(135deg,#a855f7_0%,#3b0764_45%,#0b0b12_100%)]" },
};

export function ProfileBanner({
  displayName,
  username,
  bannerStyle,
  accent,
  minecraft,
  avatarSource,
  bio,
  badges,
  actions,
}: {
  displayName: string;
  username: string;
  bannerStyle: string;
  accent: string;
  minecraft?: { name: string; uuid: string } | null;
  avatarSource?: "initials" | "minecraft";
  bio?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className={cn("sx-voxel-grid relative h-28 sm:h-36", BANNERS[bannerStyle]?.className ?? BANNERS.obsidian!.className)}>
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />
      </div>
      <div className="relative -mt-10 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
        <div className="rounded-lg p-1" style={{ background: accent }}>
          <Avatar name={displayName} size={72} accent={accent} minecraftUuid={avatarSource === "minecraft" ? minecraft?.uuid : null} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
            {minecraft && (
              <Badge tone="success" title={`Verified Minecraft Java account: ${minecraft.uuid}`}>
                Minecraft: {minecraft.name}
              </Badge>
            )}
            {badges}
          </div>
          <p className="text-sm text-muted">@{username}</p>
          {bio && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-fg/90">{bio}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
