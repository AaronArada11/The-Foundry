import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          theme: "light";
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

export function Turnstile({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onToken("dev-bypass");
      return;
    }
    const scriptId = "turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let widgetId: string | null = null;
    const render = () => {
      if (window.turnstile && containerRef.current && !widgetId) {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          theme: "light",
        });
      }
    };
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.append(script);
    } else if (window.turnstile) {
      render();
    } else {
      script.addEventListener("load", render);
    }
    return () => {
      script?.removeEventListener("load", render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);

  return siteKey ? <div className="turnstile" ref={containerRef} /> : null;
}
