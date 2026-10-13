import {
  LayoutDashboard, IdCard, Server, Hammer, Puzzle, RefreshCw, Bell, Settings, Users, Trophy, Sparkles, Shield, ScrollText, Flag,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/modules/types";

const ICONS: Record<IconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "id-card": IdCard,
  server: Server,
  hammer: Hammer,
  puzzle: Puzzle,
  "refresh-cw": RefreshCw,
  bell: Bell,
  settings: Settings,
  users: Users,
  trophy: Trophy,
  sparkles: Sparkles,
  shield: Shield,
  "scroll-text": ScrollText,
  flag: Flag,
};

export function ModuleIcon({ name, className }: { name: IconName; className?: string }) {
  const I = ICONS[name] ?? Puzzle;
  return <I className={className} aria-hidden />;
}
