import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { platformCan } from "@/lib/authz/roles";
import { listReports } from "@/modules/nexusid/social";
import { PageHeader } from "@/components/ui/panel";
import { ReportsQueue } from "@/components/studio/reports-queue";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { user, ctx } = await requireUser();
  if (!platformCan(user.platformRole, "platform.reports.review")) notFound();
  return (
    <div>
      <PageHeader eyebrow="Platform" title="Reports" description="Community reports awaiting review. Resolutions are recorded in the audit log." />
      <ReportsQueue reports={await listReports(ctx, "open")} />
    </div>
  );
}
