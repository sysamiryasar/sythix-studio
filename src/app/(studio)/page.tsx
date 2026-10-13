import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { PageHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioHome() {
  const { user } = await requireUser();
  return <PageHeader eyebrow="Studio" title={`Welcome back, ${user.displayName}`} description="Your connected Minecraft workspace." />;
}
