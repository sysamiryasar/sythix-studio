import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/auth/current";
import { all } from "@/lib/db/sql";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Development-only view of stored emails. Returns 404 in every other environment. */
export default async function DevOutbox() {
  const ctx = await getServerContext();
  if (ctx.env.APP_ENV !== "development") notFound();
  const mails = await all<{ id: string; to_email: string; subject: string; body_text: string; created_at: number }>(
    ctx.db,
    `SELECT id, to_email, subject, body_text, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 25`,
  );
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">Development outbox</h1>
      <p className="mb-4 text-sm text-muted">Emails are stored here because no email provider is configured. This page does not exist outside development.</p>
      <div className="space-y-3">
        {mails.map((m) => (
          <article key={m.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-faint">
              {formatDateTime(m.created_at)} → {m.to_email}
            </div>
            <h2 className="mt-1 text-sm font-medium">{m.subject}</h2>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted">
              {m.body_text.split(/(https?:\/\/\S+)/).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} className="text-accent underline">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </article>
        ))}
        {mails.length === 0 && <p className="text-sm text-muted">No emails yet.</p>}
      </div>
    </main>
  );
}
