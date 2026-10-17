import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, ExternalLink, ServerCog, ShieldCheck } from "lucide-react";
import type { UserSummary } from "@shared/types";
import { areaById, PRODUCT_AREAS } from "@shared/areas";
import { CHANGELOG } from "@shared/changelog";
import { platformCan, PLATFORM_ROLES, type PlatformRole } from "@shared/permissions";
import { api, errorMessage } from "../lib/api";
import { fullDate, relativeTime } from "../lib/format";
import { useMe } from "../lib/session";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Input, PageHeader, Panel, PanelHeader, Select, Spinner, Tabs, useToast } from "../components/ui";

export function AreaPage() {
  const { area = "" } = useParams();
  const a = areaById(area);
  if (!a) return <EmptyState title="Unknown area" action={<ButtonLink to="/">Home</ButtonLink>} />;
  const tone = a.status === "live" ? "success" : a.status === "partial" ? "cyan" : a.status === "needs-infra" ? "warning" : "default";
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="SythiX ecosystem" title={a.name} description={a.description} actions={<Badge tone={tone}>{a.status === "needs-infra" ? "Needs infrastructure" : a.status === "planned" ? `Planned · Milestone ${a.milestone}` : a.status}</Badge>} />
      <Panel>
        <PanelHeader title="Status today" icon={<CircleDashed className="h-4 w-4" />} />
        <div className="space-y-3 p-5 text-sm">
          <p>{a.today}</p>
          {a.requires && (
            <>
              <p className="font-medium">What it needs before it can work</p>
              <ul className="list-disc space-y-1.5 pl-5 text-muted">
                {a.requires.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-faint">SythiX Unite only shows features that actually work. This area is listed so you can see the roadmap — nothing here is simulated.</p>
        </div>
      </Panel>
      {a.id === "hosting" && (
        <Panel>
          <PanelHeader title="Why hosting isn't available yet" icon={<ServerCog className="h-4 w-4" />} />
          <div className="space-y-2 p-5 text-sm text-muted">
            <p>A management dashboard is not a hosting service. Running Minecraft servers needs dedicated compute, storage, networking and isolation that Cloudflare Workers cannot provide.</p>
            <p>The planned design connects SythiX to an authorised provider (for example a Pterodactyl panel or a controlled self-hosted node) through a scoped agent: typed actions only, authenticated requests, audit logging and quotas — never raw shell, Docker or host credentials in the browser.</p>
          </div>
        </Panel>
      )}
      <Panel>
        <PanelHeader title="All areas" />
        <ul className="divide-y divide-border">
          {PRODUCT_AREAS.map((x) => (
            <li key={x.id}>
              <Link to={x.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                {x.status === "live" || x.status === "partial" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <CircleDashed className="h-4 w-4 text-faint" />}
                <span className="flex-1">{x.name}</span>
                <span className="text-xs text-faint">Milestone {x.milestone}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Monthly Evolution" title="What's new" description="Every release, what it added and what it still can't do." />
      {CHANGELOG.map((e) => (
        <Panel key={e.version}>
          <PanelHeader title={`${e.version} — ${e.title}`} description={e.date} />
          <div className="space-y-4 p-5 text-sm">
            <div>
              <p className="mb-1.5 font-medium">Added</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {e.added.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            {e.limitations && (
              <div>
                <p className="mb-1.5 font-medium">Known limitations</p>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {e.limitations.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface Report {
  id: string;
  reporter: UserSummary | null;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  note: string | null;
  createdAt: number;
  preview: { text: string; link: string | null; state: string };
}

function ReportsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "actioned" | "dismissed">("open");
  const q = useQuery({ queryKey: ["mod-reports", status], queryFn: () => api<Report[]>(`/mod/reports?status=${status}`) });
  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "dismiss" | "remove" }) => api(`/mod/reports/${id}`, { body: { action, note: "" } }),
    onSuccess: () => {
      toast.success("Report resolved");
      void qc.invalidateQueries({ queryKey: ["mod-reports"] });
    },
    onError: (e) => toast.error("Couldn't resolve", errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <Tabs label="Report status" value={status} onChange={setStatus} items={[{ value: "open", label: "Open" }, { value: "actioned", label: "Actioned" }, { value: "dismissed", label: "Dismissed" }]} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : !q.data.length ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={status === "open" ? "No open reports" : "Nothing here"} />
      ) : (
        <ul className="space-y-3">
          {q.data.map((r) => (
            <Panel key={r.id} as="article" className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                <Badge tone="warning">{r.reason.replace("_", " ")}</Badge>
                <span className="capitalize">{r.targetType}</span>· reported by {r.reporter ? `@${r.reporter.username}` : "deleted account"} · {relativeTime(r.createdAt)}
                {r.preview.state !== "visible" && r.preview.state !== "active" && <Badge>{r.preview.state}</Badge>}
              </div>
              <blockquote className="mt-2 rounded-lg border-l-2 border-border-strong bg-surface-2 px-3 py-2 text-sm">{r.preview.text}</blockquote>
              {r.details && <p className="mt-2 text-sm text-muted">“{r.details}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.preview.link && (
                  <ButtonLink to={r.preview.link} size="sm" variant="ghost">
                    <ExternalLink className="h-4 w-4" /> View
                  </ButtonLink>
                )}
                {status === "open" && (
                  <>
                    <Button size="sm" variant="danger" disabled={r.targetType === "user"} title={r.targetType === "user" ? "Suspend accounts from the Users tab" : undefined} onClick={() => resolve.mutate({ id: r.id, action: "remove" })}>
                      Remove content
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, action: "dismiss" })}>
                      Dismiss
                    </Button>
                  </>
                )}
                {r.note && <span className="text-xs text-faint">Note: {r.note}</span>}
              </div>
            </Panel>
          ))}
        </ul>
      )}
    </div>
  );
}

function UsersTab() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["mod-users", q], queryFn: () => api<{ id: string; username: string; display_name: string; email: string; role: PlatformRole; status: string; created_at: number }[]>(`/mod/users?q=${encodeURIComponent(q)}`) });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mod-users"] }),
    onError: (e) => toast.error("That didn't work", errorMessage(e)),
  });
  if (!platformCan(me.role, "users.suspend")) return <p className="text-sm text-faint">Account management needs the admin role.</p>;
  return (
    <div className="space-y-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username or email" aria-label="Search users" />
      {users.isPending ? (
        <Spinner />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {users.data?.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {u.display_name} <span className="text-faint">@{u.username}</span>
                  </p>
                  <p className="truncate text-xs text-faint">
                    {u.email} · joined {fullDate(u.created_at)}
                  </p>
                </div>
                {u.status === "suspended" && <Badge tone="danger">suspended</Badge>}
                {platformCan(me.role, "users.set_role") && u.id !== me.id ? (
                  <Select aria-label={`Role for ${u.username}`} value={u.role} className="h-8 w-32 py-0 text-xs" onChange={(e) => act.mutate(() => api(`/mod/users/${u.id}/role`, { body: { role: e.target.value } }))}>
                    {PLATFORM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge>{u.role}</Badge>
                )}
                {u.id !== me.id && (
                  <Button size="sm" variant={u.status === "suspended" ? "outline" : "danger"} onClick={() => act.mutate(() => api(`/mod/users/${u.id}/suspend`, { body: { suspended: u.status !== "suspended", reason: "" } }))}>
                    {u.status === "suspended" ? "Reinstate" : "Suspend"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function AuditTab() {
  const q = useQuery({ queryKey: ["mod-audit"], queryFn: () => api<{ id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; created_at: number }[]>("/mod/audit") });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <Panel>
      <ul className="divide-y divide-border font-mono text-xs">
        {q.data.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-3 px-4 py-2">
            <span className="text-faint">{fullDate(a.created_at)}</span>
            <span className="text-accent">{a.action}</span>
            <span className="text-muted">
              {a.target_type}:{a.target_id}
            </span>
            <span className="text-faint">by {a.actor_id ?? "system"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ModerationPage() {
  const me = useMe();
  const [tab, setTab] = useState<"reports" | "users" | "audit">("reports");
  if (!platformCan(me.role, "moderation.review")) return <EmptyState title="Moderators only" description="You don't have access to the moderation tools." />;
  const items: { value: "reports" | "users" | "audit"; label: string }[] = [{ value: "reports", label: "Reports" }];
  if (platformCan(me.role, "users.suspend")) items.push({ value: "users", label: "Users" });
  if (platformCan(me.role, "platform.audit")) items.push({ value: "audit", label: "Audit log" });
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader eyebrow="Trust & safety" title="Moderation" description="Every action here is recorded in the audit log." />
      <Tabs label="Moderation sections" value={tab} onChange={setTab} items={items} />
      {tab === "reports" ? <ReportsTab /> : tab === "users" ? <UsersTab /> : <AuditTab />}
    </div>
  );
}

export function NotFoundPage() {
  return <EmptyState title="Page not found" description="That page doesn't exist, or you don't have access to it." action={<ButtonLink to="/" variant="primary">Go home</ButtonLink>} />;
}
