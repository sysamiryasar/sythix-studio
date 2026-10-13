import type { Metadata } from "next";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Verify email" };

// Verification happens on an explicit click (POST), never on page load, so
// link scanners that prefetch email URLs cannot consume the token.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Confirm this address belongs to you to activate your account.</p>
      <VerifyEmail token={token ?? null} />
    </>
  );
}
