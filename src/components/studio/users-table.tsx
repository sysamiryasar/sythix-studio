"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { RelativeTime } from "@/components/ui/relative-time";
import { useToast } from "@/components/ui/toast";

interface Row {
  id: string;
  email: string;
  username: string;
  roleLabel: string;
  email_verified_at: number | null;
  created_at: number;
}

export function UsersTable({ users, currentUserId }: { users: Row[]; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Panel>
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate">
                @{u.username} <span className="text-xs text-muted">{u.email}</span>
              </div>
              <div className="text-[11px] text-faint">
                {u.roleLabel} · joined <RelativeTime ts={u.created_at} />
              </div>
            </div>
            {u.email_verified_at ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <>
                <Badge tone="warning">Unverified</Badge>
                {u.id !== currentUserId && (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === u.id}
                    onClick={async () => {
                      setBusy(u.id);
                      try {
                        await api(`/api/v1/admin/users/${u.id}/verify`, { body: {} });
                        toast.success(`@${u.username} verified`, "They can sign in now.");
                        router.refresh();
                      } catch (e) {
                        toast.error("Not verified", (e as Error).message);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Verify
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
