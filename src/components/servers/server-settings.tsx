"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { ServerSummary } from "@/modules/serveros/servers";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export function ServerSettings({ server }: { server: ServerSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name: server.name, address: server.address, software: server.software, mcVersion: server.mc_version, environment: server.environment, description: server.description });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  return (
    <div className="max-w-3xl space-y-6">
      <Panel>
        <PanelHeader title="Server details" />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(p) => <Input {...p} value={f.name} maxLength={48} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Public address">{(p) => <Input {...p} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
          <Field label="Software">{(p) => <Select {...p} value={f.software} onChange={(e) => setF({ ...f, software: e.target.value })}><option value="paper">Paper</option><option value="purpur">Purpur</option></Select>}</Field>
          <Field label="Minecraft version" hint={server.connection.reportedVersion ? `Agent reports ${server.connection.reportedVersion}` : undefined}>{(p) => <Input {...p} value={f.mcVersion} onChange={(e) => setF({ ...f, mcVersion: e.target.value })} />}</Field>
          <Field label="Environment">{(p) => <Select {...p} value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></Select>}</Field>
          <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="sm:col-span-2">
            <Button variant="primary" loading={busy} onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/v1/servers/${server.id}`, { method: "PATCH", body: f });
                toast.success("Server updated");
                router.refresh();
              } catch (e) {
                toast.error("Not saved", (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>Save</Button>
          </div>
        </PanelBody>
      </Panel>
      <Panel className="border-danger/40">
        <PanelHeader title="Remove server" description="Deletes the registration, credentials, telemetry, console history and deployment records from SythiX. Nothing on the Minecraft server is touched. Audit events are kept." />
        <PanelBody>
          <Button variant="danger" onClick={() => setDel(true)}>Remove {server.name}</Button>
        </PanelBody>
      </Panel>
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={`Remove ${server.name}?`}
        description={server.connection.state === "online" ? "The agent is currently connected; it will be rejected on its next heartbeat." : "This server is disconnected."}
        confirmText={server.name}
        confirmLabel="Remove server"
        danger
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/v1/servers/${server.id}`, { method: "DELETE" });
            toast.success("Server removed");
            router.push("/servers");
            router.refresh();
          } catch (e) {
            toast.error("Not removed", (e as Error).message);
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
