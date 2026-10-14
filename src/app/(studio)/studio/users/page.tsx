import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { platformCan, ROLE_LABELS, type PlatformRoleId } from "@/lib/authz/roles";
import { all } from "@/lib/db/sql";
import { emailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/ui/panel";
import { UsersTable } from "@/components/studio/users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const { user, ctx } = await requireUser();
  if (!platformCan(user.platformRole, "platform.users.manage")) notFound();
  const users = await all<{ id: string; email: string; username: string; platform_role: PlatformRoleId; email_verified_at: number | null; created_at: number }>(
    ctx.db,
    `SELECT id, email, username, platform_role, email_verified_at, created_at FROM users ORDER BY email_verified_at IS NOT NULL, created_at DESC LIMIT 500`,
  );
  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description={
          emailConfigured(ctx.env)
            ? "All accounts on this installation."
            : "No email provider is configured, so new accounts wait here until a platform owner verifies them."
        }
      />
      <UsersTable users={users.map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.platform_role] }))} currentUserId={user.id} />
    </div>
  );
}
