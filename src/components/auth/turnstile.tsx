"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
  }
}

/** Renders a Cloudflare Turnstile widget when a site key is configured; otherwise renders nothing. */
export function Turnstile({ siteKey, onToken }: { siteKey: string | null; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widgetId: string | null = null;
    const el = ref.current;
    const render = () => {
      if (!window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(el, {
        sitekey: siteKey,
        theme: "dark",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      const id = "cf-turnstile-script";
      let s = document.getElementById(id) as HTMLScriptElement | null;
      if (!s) {
        s = document.createElement("script");
        s.id = id;
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);
  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
