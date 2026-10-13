"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/client/api";

export interface CommandOutcome<T = unknown> {
  status: "succeeded" | "failed" | "expired" | "timeout";
  data?: T;
  error?: string;
}

/**
 * Sends an operation to a server and waits for the agent's real result.
 * There is no optimistic success: the UI only reports what the agent reported.
 */
export function useServerCommand(serverId: string) {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T,>(path: string, body: unknown, timeoutMs = 60_000): Promise<CommandOutcome<T>> => {
      setPending(true);
      try {
        const { id } = await api<{ id: string }>(`/api/v1/servers/${serverId}/${path}`, { body });
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
          await new Promise((r) => setTimeout(r, 1500));
          const c = await api<{ status: string; result: { ok: boolean; data?: T; error?: string } | null }>(`/api/v1/servers/${serverId}/commands/${id}`);
          if (c.status === "succeeded") return { status: "succeeded", data: c.result?.data };
          if (c.status === "failed") return { status: "failed", error: c.result?.error ?? "The agent reported a failure." };
          if (c.status === "expired") return { status: "expired", error: "The agent did not pick up the operation in time." };
        }
        return { status: "timeout", error: "No result yet. The operation may still complete; check the audit log." };
      } finally {
        setPending(false);
      }
    },
    [serverId],
  );
  return { run, pending };
}
