"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Module-level error boundary: a failure in one module page never takes down the shell. */
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-danger/30 bg-danger/5 p-6 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-danger" />
      <h1 className="mt-3 text-base font-semibold">This section failed to load</h1>
      <p className="mt-1 text-sm text-muted">The rest of SythiX Studio is unaffected. {error.digest && <span className="font-mono text-xs">Ref: {error.digest}</span>}</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
