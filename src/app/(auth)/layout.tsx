import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { Wordmark } from "@/components/shell/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1fr_minmax(440px,520px)]">
      <aside className="sx-voxel-grid relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-cyan/10 blur-[110px]" />
        <Link href="/login" className="relative">
          <Wordmark />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">One account · One ecosystem</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            Build items. Run servers. <span className="sx-gradient-text">Own your identity.</span>
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-muted">
            <li><span className="font-medium text-fg">NexusID</span> — profiles, achievements, friends and teams.</li>
            <li><span className="font-medium text-fg">ForgeOS</span> — design items and abilities, export validated datapacks and resource packs.</li>
            <li><span className="font-medium text-fg">ServerOS</span> — connect Paper and Purpur servers through a secure outbound agent.</li>
          </ul>
        </div>
        <p className="relative text-xs text-faint">Not affiliated with Mojang Studios or Microsoft.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
