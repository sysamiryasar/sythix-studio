import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listCosmetics } from "@/modules/nexusid/cosmetics";
import { CosmeticsBrowser } from "@/components/nexus/cosmetics-browser";

export const metadata: Metadata = { title: "Cosmetics" };

export default async function CosmeticsPage() {
  const { user, ctx } = await requireUser();
  return <CosmeticsBrowser items={await listCosmetics(ctx, user.id)} />;
}
