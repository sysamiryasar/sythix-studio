import { requireUser } from "@/lib/auth/current";
import { getShellData } from "@/lib/shell";
import { AppShell } from "@/components/shell/app-shell";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const data = await getShellData(user);
  return <AppShell data={data}>{children}</AppShell>;
}
