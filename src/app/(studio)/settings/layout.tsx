import { PageHeader } from "@/components/ui/panel";
import { RouteTabs } from "@/components/ui/tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your SythiX account, security and preferences." />
      <RouteTabs
        tabs={[
          { href: "/settings", label: "Account", exact: true },
          { href: "/settings/security", label: "Security" },
          { href: "/settings/preferences", label: "Preferences" },
        ]}
      />
      {children}
    </div>
  );
}
