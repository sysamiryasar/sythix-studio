import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getPreferences } from "@/modules/studio/preferences";
import { PreferencesForm } from "@/components/settings/preferences";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const { user, ctx } = await requireUser();
  const prefs = await getPreferences(ctx, user.id);
  return (
    <Panel>
      <PanelHeader title="Appearance and behaviour" description="Saved to your account and applied on every device." />
      <PanelBody>
        <PreferencesForm initial={prefs} />
      </PanelBody>
    </Panel>
  );
}
