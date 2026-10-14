"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, ShieldBan, UserCheck, UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function ProfileActions({ targetId, username, relationship }: { targetId: string; username: string; relationship: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ reason: "harassment", details: "" });
  return (
    <>
      {relationship === "none" && (
        <Button
          size="sm"
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/v1/nexus/friends", { body: { username } });
              toast.success(`Friend request sent to ${username}`);
              router.refresh();
            } catch (e) {
              toast.error("Request not sent", (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <UserPlus className="h-3.5 w-3.5" /> Add friend
        </Button>
      )}
      {relationship === "friends" && (
        <Button size="sm" variant="secondary" disabled>
          <UserCheck className="h-3.5 w-3.5" /> Friends
        </Button>
      )}
      {relationship === "pending_outgoing" && (
        <Button size="sm" variant="secondary" disabled>
          Request sent
        </Button>
      )}
      {relationship === "pending_incoming" && (
        <Button size="sm" variant="primary" onClick={() => router.push("/nexus/friends")}>
          Respond to request
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)} aria-label="Report">
        <Flag className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setBlockOpen(true)} aria-label="Block">
        <ShieldBan className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={`Block ${username}?`}
        description="They won't be able to see your profile, send you friend requests or invite you to teams. Any friendship is removed."
        confirmLabel="Block"
        danger
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api("/api/v1/nexus/blocks", { body: { username } });
            toast.success(`${username} blocked`);
            router.push("/nexus/friends");
          } catch (e) {
            toast.error("Block failed", (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Report ${username}`}
        description="Reports are reviewed by platform administrators."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/v1/nexus/reports", { body: { targetType: "user", targetId, ...report } });
                  toast.success("Report submitted", "Thank you. An administrator will review it.");
                  setReportOpen(false);
                } catch (e) {
                  toast.error("Report not submitted", (e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reason">
            {(p) => (
              <Select {...p} value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })}>
                <option value="harassment">Harassment</option>
                <option value="spam">Spam</option>
                <option value="impersonation">Impersonation</option>
                <option value="inappropriate_content">Inappropriate content</option>
                <option value="cheating">Cheating</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
          <Field label="Details (optional)">{(p) => <Textarea {...p} maxLength={2000} value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} />}</Field>
        </div>
      </Dialog>
    </>
  );
}
