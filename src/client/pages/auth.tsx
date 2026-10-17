import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { registerSchema } from "@shared/schemas";
import { api, ApiError, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, Field, Input, Spinner } from "../components/ui";
import { SythixMark } from "../components/logo";
import { Turnstile } from "../components/turnstile";

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="sx-banner-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <div className="absolute -left-10 bottom-10 h-72 w-72 rounded-full bg-cyan/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <SythixMark size={36} />
          <span className="font-display text-lg font-semibold">
            SythiX <span className="sx-gradient-text">Unite</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Everything.
            <br />
            Everyone.
            <br />
            <span className="sx-gradient-text">United.</span>
          </h1>
          <p className="mt-5 text-muted">One identity. One platform. Infinite possibilities — your social world, your communities and your games in one place.</p>
        </div>
        <ul className="relative grid grid-cols-2 gap-3 text-sm text-muted">
          {["Social feeds & creators", "Communities & real-time chat", "Direct & group messages", "Privacy you control"].map((f) => (
            <li key={f} className="rounded-xl border border-border bg-surface/60 px-3 py-2">
              {f}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="sx-in w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <SythixMark size={32} />
            <span className="font-display text-lg font-semibold">
              SythiX <span className="sx-gradient-text">Unite</span>
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-sm text-muted">{footer}</p>
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { me, loading } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;
  if (me) return <Navigate to={params.get("next") ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { body: { identifier, password } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your SythiX ID." footer={<>New here? <Link to="/register" className="text-accent hover:underline">Create your SythiX ID</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email or username">{(id) => <Input id={id} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />}</Field>
        <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { me, loading } = useSession();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", username: "", displayName: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [welcomeTo, setWelcomeTo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const onToken = useCallback((t: string | undefined) => setTurnstileToken(t), []);
  if (loading) return <Spinner />;
  if (me) return <Navigate to={welcomeTo ?? "/"} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await api<{ role: string }>("/auth/register", { body: { ...form, turnstileToken } });
      setWelcomeTo(created.role === "owner" ? "/?welcome=owner" : "/?welcome=1");
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) setErrors(Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your SythiX ID" subtitle="One account for every SythiX area." footer={<>Already have an account? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Display name" error={errors.displayName}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.displayName} value={form.displayName} onChange={set("displayName")} maxLength={40} autoFocus />}</Field>
        <Field label="Username" hint="3–20 letters, numbers or underscores. This is your @handle." error={errors.username}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.username} autoComplete="username" value={form.username} onChange={set("username")} maxLength={20} />}
        </Field>
        <Field label="Email" error={errors.email}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.email} type="email" autoComplete="email" value={form.email} onChange={set("email")} />}</Field>
        <Field label="Password" hint="At least 10 characters. A passphrase works well." error={errors.password}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.password} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        <Turnstile onToken={onToken} />
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Create account
        </Button>
        <p className="text-xs text-faint">We never ask for your Minecraft or game passwords. You can export or delete your data at any time.</p>
      </form>
    </AuthLayout>
  );
}
