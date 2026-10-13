import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listNotifications } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/panel";
import { NotificationList } from "@/components/studio/notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { user, ctx } = await requireUser();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" description="Server connectivity, deployments, validations, community and security events. Read notifications are removed after 90 days." />
      <NotificationList items={await listNotifications(ctx, user.id, 100)} />
    </div>
  );
}
