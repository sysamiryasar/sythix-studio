import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface PublicConfig {
  turnstileSiteKey: string | null;
  /** Which media backend is connected, or null when uploads are unavailable. */
  mediaStorage: "supabase" | "r2" | null;
}

export function usePublicConfig() {
  return useQuery({ queryKey: ["public-config"], queryFn: () => api<PublicConfig>("/platform/public-config"), staleTime: 5 * 60_000 });
}

/** True/false once known; undefined while loading. */
export function useUploadsEnabled(): boolean | undefined {
  const q = usePublicConfig();
  return q.data ? q.data.mediaStorage !== null : undefined;
}
