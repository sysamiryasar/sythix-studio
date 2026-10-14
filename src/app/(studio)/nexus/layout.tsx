import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/auth/current";
import { isModuleAvailable } from "@/modules/service";
import { RouteTabs } from "@/components/ui/tabs";

export default async function NexusLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModuleAvailable(await getServerContext(), "nexusid"))) notFound();
  return (
    <div>
      <RouteTabs
        tabs={[
          { href: "/nexus", label: "Profile", exact: true },
          { href: "/nexus/cosmetics", label: "Cosmetics" },
          { href: "/nexus/achievements", label: "Achievements" },
          { href: "/nexus/friends", label: "Friends" },
          { href: "/nexus/teams", label: "Teams" },
        ]}
      />
      {children}
    </div>
  );
}
