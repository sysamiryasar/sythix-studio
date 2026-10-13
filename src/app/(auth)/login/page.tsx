import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Sign in to SythiX Studio</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Use your SythiX account. We never ask for your Minecraft or Microsoft password.</p>
      <LoginForm next={next} />
    </>
  );
}
