import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me } from "@shared/types";
import { api } from "./api";

export type MeWithAccent = Me & { accentName: string };

const Ctx = createContext<{ me: MeWithAccent | null; loading: boolean; refresh: () => Promise<unknown> }>({ me: null, loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me"], queryFn: () => api<MeWithAccent | null>("/me"), staleTime: 60_000 });
  const me = q.data ?? null;

  // Apply appearance preferences to the document.
  useEffect(() => {
    const root = document.documentElement;
    const theme = me?.preferences.theme ?? "dark";
    const apply = () => {
      const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
      root.dataset.theme = resolved;
    };
    apply();
    root.dataset.motion = me?.preferences.reducedMotion ? "reduced" : "full";
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [me?.preferences.theme, me?.preferences.reducedMotion]);

  return <Ctx.Provider value={{ me, loading: q.isLoading, refresh: () => qc.invalidateQueries({ queryKey: ["me"] }) }}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}

/** For pages inside the authenticated shell, where `me` is guaranteed. */
export function useMe(): MeWithAccent {
  const { me } = useContext(Ctx);
  if (!me) throw new Error("useMe outside the signed-in shell");
  return me;
}
