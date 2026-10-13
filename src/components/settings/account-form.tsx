"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

export function AccountForm({ username, email, displayName, emailVerified }: { username: string; email: string; displayName: string; emailVerified: boolean }) {
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api("/api/v1/me/account", { method: "PATCH", body: { displayName: name } });
          toast.success("Display name updated");
          router.refresh();
        } catch (err) {
          toast.error("Could not save", (err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Username">{(p) => <Input {...p} value={username} disabled />}</Field>
      <Field label="Email" hint={emailVerified ? undefined : "Unverified"}>
        {(p) => (
          <div className="relative">
            <Input {...p} value={email} disabled />
            <span className="absolute right-2 top-2">{emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}</span>
          </div>
        )}
      </Field>
      <Field label="Display name" className="sm:col-span-2">
        {(p) => <Input {...p} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" loading={saving} disabled={name.trim() === displayName || !name.trim()}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
