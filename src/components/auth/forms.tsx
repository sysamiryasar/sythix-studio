"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Turnstile } from "./turnstile";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

function FormSuccess({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-lg border border-success/40 bg-success/5 p-4">
      <p className="text-sm font-medium text-success">{title}</p>
      <div className="mt-1 text-sm text-muted">{children}</div>
    </div>
  );
}

function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const capture = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === "validation_failed" && Array.isArray(e.details)) {
      const map: Record<string, string> = {};
      for (const d of e.details as { path: string; message: string }[]) map[d.path] ??= d.message;
      setErrors(map);
      setFormError(Object.keys(map).length ? null : e.message);
    } else {
      setErrors({});
      setFormError((e as Error).message);
    }
  };
  return { errors, formError, capture, reset: () => (setErrors({}), setFormError(null)) };
}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const { formError, capture, reset } = useFieldErrors();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        reset();
        setLoading(true);
        try {
          await api("/api/v1/auth/login", { body: { email, password } });
          window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        } catch (err) {
          setUnverified(err instanceof ApiClientError && (err.details as { reason?: string })?.reason === "email_unverified");
          capture(err);
          setLoading(false);
        }
      }}
    >
      <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <FormError message={formError} />
      {unverified && (
        <button
          type="button"
          disabled={resent}
          className="text-xs text-accent hover:underline disabled:text-muted disabled:no-underline"
          onClick={async () => {
            await api("/api/v1/auth/verify-email/resend", { body: { email } }).catch(() => {});
            setResent(true);
          }}
        >
          {resent ? "If the account exists and is unverified, a new link has been sent." : "Resend verification email"}
        </button>
      )}
      <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
        Sign in
      </Button>
      <div className="flex justify-between text-xs">
        <Link href="/forgot-password" className="text-muted hover:text-fg">
          Forgot password?
        </Link>
        <Link href="/register" className="text-accent hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { errors, formError, capture, reset } = useFieldErrors();
  const onToken = useCallback((t: string | null) => setToken(t), []);
  if (done)
    return (
      <FormSuccess title="Check your inbox">
        We sent a verification link to <span className="text-fg">{form.email}</span>. Verify your email, then{" "}
        <Link className="text-accent hover:underline" href="/login">
          sign in
        </Link>
        .
      </FormSuccess>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        reset();
        setLoading(true);
        try {
          await api("/api/v1/auth/register", { body: { ...form, turnstileToken: token ?? undefined } });
          setDone(true);
        } catch (err) {
          capture(err);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Email" error={errors.email}>
        {(p) => <Input {...p} type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
      </Field>
      <Field label="Username" hint="3–16 characters: letters, numbers, underscores." error={errors.username}>
        {(p) => (
          <Input {...p} autoComplete="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        )}
      </Field>
      <Field label="Password" hint="At least 10 characters. Never reuse your Minecraft or Microsoft password." error={errors.password}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
      </Field>
      <Turnstile siteKey={turnstileSiteKey} onToken={onToken} />
      <FormError message={formError} />
      <Button type="submit" variant="primary" className="w-full justify-center" loading={loading} disabled={!!turnstileSiteKey && !token}>
        Create account
      </Button>
      <p className="text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { formError, capture, reset } = useFieldErrors();
  const onToken = useCallback((t: string | null) => setToken(t), []);
  if (done) return <FormSuccess title="Check your inbox">If an account exists for {email}, a reset link is on its way. It expires in one hour.</FormSuccess>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        reset();
        setLoading(true);
        try {
          await api("/api/v1/auth/password/forgot", { body: { email, turnstileToken: token ?? undefined } });
          setDone(true);
        } catch (err) {
          capture(err);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Turnstile siteKey={turnstileSiteKey} onToken={onToken} />
      <FormError message={formError} />
      <Button type="submit" variant="primary" className="w-full justify-center" loading={loading} disabled={!!turnstileSiteKey && !token}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { formError, capture, reset } = useFieldErrors();
  if (done)
    return (
      <FormSuccess title="Password updated">
        All sessions were signed out.{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>{" "}
        with your new password.
      </FormSuccess>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        reset();
        if (password !== confirm) return capture(new Error("Passwords do not match."));
        setLoading(true);
        try {
          await api("/api/v1/auth/password/reset", { body: { token, password } });
          setDone(true);
        } catch (err) {
          capture(err);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="New password" hint="At least 10 characters.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirm new password">
        {(p) => <Input {...p} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <FormError message={formError} />
      <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
        Update password
      </Button>
    </form>
  );
}
