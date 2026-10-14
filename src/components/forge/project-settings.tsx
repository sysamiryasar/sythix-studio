"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { ProjectRow } from "@/modules/forgeos/content";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export function ProjectSettings({ project, packDescription, targets, canEdit }: { project: ProjectRow; packDescription: string; targets: { id: string; label: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name: project.name, description: project.description, namespace: project.namespace, targetVersion: project.target_version, folder: project.folder, visibility: project.visibility, packDescription });
  const [saving, setSaving] = useState(false);
  return (
    <Panel className="max-w-3xl">
      <PanelHeader title="Project settings" description="Changing the namespace or target version changes every generated identifier and format; re-export and re-deploy afterwards." />
      <PanelBody>
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(p) => <Input {...p} maxLength={64} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Folder">{(p) => <Input {...p} maxLength={80} value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })} />}</Field>
          <Field label="Namespace">{(p) => <Input {...p} className="font-mono" maxLength={24} value={f.namespace} onChange={(e) => setF({ ...f, namespace: e.target.value.toLowerCase() })} />}</Field>
          <Field label="Minecraft version">
            {(p) => (
              <Select {...p} value={f.targetVersion} onChange={(e) => setF({ ...f, targetVersion: e.target.value })}>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Visibility" hint="Public projects appear on your NexusID creator profile (metadata only; files stay private).">
            {(p) => (
              <Select {...p} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as "private" | "public" })}>
                <option value="private">Private to workspace</option>
                <option value="public">Public on creator profile</option>
              </Select>
            )}
          </Field>
          <Field label="Resource pack description">{(p) => <Input {...p} maxLength={200} value={f.packDescription} onChange={(e) => setF({ ...f, packDescription: e.target.value })} />}</Field>
          <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="sm:col-span-2">
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api(`/api/v1/forge/projects/${project.id}`, { method: "PATCH", body: f });
                  toast.success("Project updated");
                  router.refresh();
                } catch (e) {
                  toast.error("Not saved", (e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save settings
            </Button>
          </div>
        </fieldset>
      </PanelBody>
    </Panel>
  );
}
