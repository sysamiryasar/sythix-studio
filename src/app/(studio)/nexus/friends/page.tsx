import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listBlocks, listFriends } from "@/modules/nexusid/social";
import { FriendsManager } from "@/components/nexus/friends-manager";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const { user, ctx } = await requireUser();
  const [friends, blocks] = await Promise.all([listFriends(ctx, user.id), listBlocks(ctx, user.id)]);
  return <FriendsManager friends={friends} blocks={blocks} verified={user.emailVerified} />;
}
