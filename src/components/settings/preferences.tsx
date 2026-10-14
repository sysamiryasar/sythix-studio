"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Switch } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { Preferences } from "@/modules/studio/preferences";

export function PreferencesForm({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const toast = useToast();
  const save = async (patch: Partial<Preferences>) => {
    const prev = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (patch.theme) document.documentElement.dataset.theme = patch.theme;
    if (patch.reducedMotion !== undefined) document.documentElement.dataset.reducedMotion = String(patch.reducedMotion);
    try {
      await api("/api/v1/me/preferences", { method: "PATCH", body: patch });
    } catch (e) {
      setPrefs(prev);
      toast.error("Preference not saved", (e as Error).message);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Theme</div>
          <div className="text-xs text-muted">Dark is the default SythiX look.</div>
        </div>
        <SegmentedControl
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => save({ theme })}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
          ]}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Reduce motion</div>
          <div className="text-xs text-muted">Minimise animations across the Studio.</div>
        </div>
        <Switch label="Reduce motion" checked={prefs.reducedMotion} onChange={(v) => save({ reducedMotion: v })} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Collapsed sidebar</div>
          <div className="text-xs text-muted">Also toggled with Ctrl/⌘ B.</div>
        </div>
        <Switch label="Collapsed sidebar" checked={prefs.sidebarCollapsed} onChange={(v) => save({ sidebarCollapsed: v })} />
      </div>
    </div>
  );
}
