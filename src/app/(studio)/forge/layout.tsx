import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/auth/current";
import { isModuleAvailable } from "@/modules/service";

export default async function ForgeLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModuleAvailable(await getServerContext(), "forgeos"))) notFound();
  return children;
}
