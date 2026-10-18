import { useEffect, useRef } from "react";
import { usePublicConfig } from "../lib/config";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

/** Renders Cloudflare Turnstile when the installation has it configured; otherwise nothing. */
export function Turnstile({ onToken }: { onToken: (t: string | undefined) => void }) {
  const cfg = usePublicConfig();
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = cfg.data?.turnstileSiteKey;
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widget: string | undefined;
    const mount = () => {
      if (window.turnstile && ref.current) widget = window.turnstile.render(ref.current, { sitekey: siteKey, callback: (t: string) => onToken(t), "expired-callback": () => onToken(undefined), theme: "auto" });
    };
    if (window.turnstile) mount();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    }
    return () => {
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, onToken]);
  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
