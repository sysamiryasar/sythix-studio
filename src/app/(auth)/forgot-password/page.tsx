import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { getServerContext } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const ctx = await getServerContext();
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">We&apos;ll email you a single-use link.</p>
      <ForgotPasswordForm turnstileSiteKey={ctx.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
      <Link href="/login" className="mt-6 block text-center text-xs text-muted hover:text-fg">
        Back to sign in
      </Link>
    </>
  );
}
