import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCurrentUser, getServerContext } from "@/lib/auth/current";
import { getPreferences } from "@/modules/studio/preferences";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "SythiX Studio", template: "%s · SythiX Studio" },
  description: "The all-in-one Minecraft center: identity, server management and content creation.",
};

export const viewport: Viewport = { themeColor: "#07070b", colorScheme: "dark light" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  const prefs = user ? await getPreferences(await getServerContext(), user.id) : null;
  return (
    <html lang="en" data-theme={prefs?.theme ?? "dark"} data-reduced-motion={prefs?.reducedMotion ? "true" : undefined}>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
