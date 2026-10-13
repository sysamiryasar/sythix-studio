"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <div className="mb-1 text-[11px] text-faint">{label}</div>}
      <pre className="sx-scroll overflow-x-auto rounded-md border border-border bg-bg p-3 pr-10 font-mono text-xs text-fg">{text}</pre>
      <button
        aria-label="Copy"
        className="absolute right-2 top-2 rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
        style={label ? { top: "1.6rem" } : undefined}
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AgentInstructions({ token, appUrl }: { token: string; appUrl: string }) {
  const [mode, setMode] = useState<"live" | "simulated">("live");
  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Agent mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "live", label: "Real Paper/Purpur server" },
          { value: "simulated", label: "Simulated (sample environment)" },
        ]}
      />
      {mode === "live" ? (
        <ol className="list-decimal space-y-4 pl-5 text-sm">
          <li>
            In <span className="font-mono">server.properties</span>, enable RCON on localhost only and set a strong password:
            <CopyBlock text={"enable-rcon=true\nrcon.port=25575\nrcon.password=<a long random password>\n# Do NOT forward or expose port 25575."} />
          </li>
          <li>
            On the same machine (Node.js 20+), from the server directory, create the agent config. The file is written with mode 600:
            <CopyBlock text={`npx @sythix/server-agent init --api-url ${appUrl} --token ${token} --server-dir .`} />
            <p className="mt-1 text-xs text-muted">Until the agent is published, build it from this repository: <span className="font-mono">pnpm agent:build</span> and run <span className="font-mono">node agent/dist/agent.js</span>.</p>
          </li>
          <li>
            Edit <span className="font-mono">sythix-agent.json</span>: set <span className="font-mono">rcon.password</span> and review <span className="font-mono">allow</span>. Config editing and datapack deployment are off by default.
          </li>
          <li>
            Start it (ideally as a systemd service running as the Minecraft user):
            <CopyBlock text="npx @sythix/server-agent run --config sythix-agent.json" />
          </li>
        </ol>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-warning">The simulated agent produces fake players, TPS and console output so you can explore ServerOS without a Minecraft server. It is labelled “Sample environment” everywhere and never counts as a real connection.</p>
          <CopyBlock text={`npx @sythix/server-agent init --api-url ${appUrl} --token ${token} --simulated\nnpx @sythix/server-agent run --config sythix-agent.json`} />
        </div>
      )}
    </div>
  );
}

export function ConnectWizard({ canRegister, verified, appUrl }: { canRegister: boolean; verified: boolean; appUrl: string }) {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", address: "", software: "paper", mcVersion: "1.21.4", environment: "production", description: "" });
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<{ id: string; token: string } | null>(null);
  const [state, setState] = useState<string>("never_connected");

  useEffect(() => {
    if (!server || state === "online") return;
    const t = setInterval(async () => {
      try {
        const s = await api<{ connection: { state: string } }>(`/api/v1/servers/${server.id}`);
        setState(s.connection.state);
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [server, state]);

  if (!canRegister) return <p className="text-sm text-muted">Your role in this workspace can&apos;t register servers. Ask a workspace owner or administrator.</p>;
  if (!verified) return <p className="text-sm text-warning">Verify your email address before registering servers.</p>;

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-xs">
        {["Server details", "Connect the agent"].map((label, i) => (
          <li key={label} className={cn("flex items-center gap-2 rounded-full border px-3 py-1", step === i + 1 ? "border-accent text-fg" : "border-border text-faint")}>
            <span className="font-mono">{i + 1}</span> {label}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <Panel>
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(p) => <Input {...p} maxLength={48} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <Field label="Public address" hint="Optional, e.g. play.example.com">{(p) => <Input {...p} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}</Field>
            <Field label="Server software" hint="Paper and Purpur are supported.">
              {(p) => (
                <Select {...p} value={form.software} onChange={(e) => setForm({ ...form, software: e.target.value })}>
                  <option value="paper">Paper</option>
                  <option value="purpur">Purpur</option>
                </Select>
              )}
            </Field>
            <Field label="Minecraft version">{(p) => <Input {...p} value={form.mcVersion} onChange={(e) => setForm({ ...form, mcVersion: e.target.value })} />}</Field>
            <Field label="Environment" hint="Production deployments require typed confirmation.">
              {(p) => (
                <Select {...p} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </Select>
              )}
            </Field>
            <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
            <div className="sm:col-span-2">
              <Button
                variant="primary"
                loading={busy}
                disabled={form.name.trim().length < 2}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const s = await api<{ id: string }>("/api/v1/servers", { body: form });
                    const c = await api<{ token: string }>(`/api/v1/servers/${s.id}/credentials`, { body: { label: "Initial agent credential" } });
                    setServer({ id: s.id, token: c.token });
                    setStep(2);
                  } catch (e) {
                    toast.error("Server not registered", (e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Register and generate credential
              </Button>
            </div>
          </PanelBody>
        </Panel>
      )}
      {step === 2 && server && (
        <>
          <Panel className="border-warning/40">
            <PanelHeader title="Agent credential" description="Shown once. Store it only in the agent's config file. You can revoke or rotate it anytime under Access." />
            <PanelBody>
              <CopyBlock text={server.token} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Install and run the agent" description="The agent connects outbound over HTTPS; no inbound ports are opened." />
            <PanelBody>
              <AgentInstructions token={server.token} appUrl={appUrl} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelBody className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                {state === "online" ? <Check className="h-4 w-4 text-success" /> : <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                {state === "online" ? "Agent connected." : "Waiting for the first heartbeat…"}
              </div>
              <div className="flex gap-2">
                <Link href={`/servers/${server.id}`} className="text-xs text-muted hover:text-fg">
                  Skip for now
                </Link>
                {state === "online" && <ButtonLink href={`/servers/${server.id}`} variant="primary">Open dashboard</ButtonLink>}
              </div>
            </PanelBody>
          </Panel>
        </>
      )}
    </div>
  );
}
