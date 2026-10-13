import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/forms";
import { getServerContext } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const ctx = await getServerContext();
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your SythiX account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">One account for NexusID, ForgeOS and ServerOS.</p>
      <RegisterForm turnstileSiteKey={ctx.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
    </>
  );
}
