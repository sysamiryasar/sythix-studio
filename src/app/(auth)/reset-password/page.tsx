import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Every other session will be signed out.</p>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-danger">
          This reset link is incomplete. <Link href="/forgot-password" className="text-accent hover:underline">Request a new one</Link>.
        </p>
      )}
    </>
  );
}
