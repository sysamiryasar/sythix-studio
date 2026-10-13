"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Monitor } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface Session {
  id: string;
  created_at: number;
  last_seen_at: number;
  ip: string | null;
  user_agent: string | null;
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Firefox/.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : ua.split(" ")[0];
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

export function SessionList({ sessions, current }: { sessions: Session[]; current: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <ul className="divide-y divide-border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <Monitor className="h-4 w-4 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                {describeAgent(s.user_agent)} {s.id === current && <Badge tone="accent">This device</Badge>}
              </div>
              <div className="text-xs text-faint">
                {s.ip ?? "Unknown IP"} · active <RelativeTime ts={s.last_seen_at} /> · signed in <RelativeTime ts={s.created_at} />
              </div>
            </div>
            {s.id !== current && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === s.id}
                onClick={async () => {
                  setBusy(s.id);
                  try {
                    await api(`/api/v1/me/sessions/${s.id}`, { method: "DELETE" });
                    toast.success("Session signed out");
                    router.refresh();
                  } catch (e) {
                    toast.error("Could not sign out session", (e as Error).message);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <div className="border-t border-border px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => setConfirmAll(true)}>
            Sign out all other sessions
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out all other sessions?"
        description="Every device except this one will need to sign in again."
        confirmLabel="Sign out others"
        danger
        loading={busy === "all"}
        onConfirm={async () => {
          setBusy("all");
          try {
            const r = await api<{ revoked: number }>("/api/v1/me/sessions", { method: "DELETE" });
            toast.success(`Signed out ${r.revoked} session${r.revoked === 1 ? "" : "s"}`);
            setConfirmAll(false);
            router.refresh();
          } catch (e) {
            toast.error("Failed", (e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      />
    </>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api("/api/v1/auth/password/change", { body: { currentPassword: current, newPassword: next } });
          toast.success("Password changed", "Other sessions have been signed out.");
          setCurrent("");
          setNext("");
        } catch (err) {
          toast.error("Password not changed", (err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
      <Field label="New password" hint="At least 10 characters.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  );
}
