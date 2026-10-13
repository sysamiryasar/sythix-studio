import { z } from "zod";
import { route } from "@/lib/http/api";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications";

export const GET = route({}, async ({ ctx, user, query }) => {
  const unread = await unreadCount(ctx, user.id);
  if (query.get("countOnly")) return { unread };
  return { unread, items: await listNotifications(ctx, user.id, 50) };
});

export const POST = route({}, async ({ ctx, user, body }) => {
  const { ids } = await body(z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(64)).max(100)]) }));
  await markRead(ctx, user.id, ids);
  return { unread: await unreadCount(ctx, user.id) };
});
