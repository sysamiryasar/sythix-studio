"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  if (!token) return <p className="text-sm text-danger">This verification link is incomplete.</p>;
  if (state === "done")
    return (
      <div role="status" className="rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
        <p className="font-medium text-success">Email verified</p>
        <p className="mt-1 text-muted">
          Your account is active. <Link href="/login" className="text-accent hover:underline">Sign in</Link>.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      <Button
        variant="primary"
        className="w-full justify-center"
        loading={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            await api("/api/v1/auth/verify-email", { body: { token } });
            setState("done");
          } catch (e) {
            setMessage((e as Error).message);
            setState("error");
          }
        }}
      >
        Verify email address
      </Button>
      {state === "error" && <p role="alert" className="text-xs text-danger">{message}</p>}
    </div>
  );
}
