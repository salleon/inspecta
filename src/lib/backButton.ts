import { useEffect, useRef } from "react";

// Android back button: goes UP the app's structure rather than back
// through history — finding / export → that site's findings list →
// dashboard → close the app. History alone kept dropping people back into
// old findings, since "Save & next finding" stacks every finding into it.
//
// A screen can take over the button while it's open (e.g. the finding
// screen saves first, or closes a picker) with useBackHandler.

export const BACK_EVENT = "inspecta:back";

// where back goes from a route; null means "leave the app"
export function parentRoute(pathname: string): string | null {
  const site = /^\/site\/([^/]+)\/(findings|export|flow-export|finding\/[^/]+\/note|flow\/[^/]+)$/.exec(pathname);
  if (site) return site[2] === "findings" ? "/" : site[2].startsWith("flow/") ? `/site/${site[1]}/findings?tab=flow` : `/site/${site[1]}/findings`;
  // admin: keyword → list → admin menu → settings → dashboard
  if (pathname.startsWith("/admin/")) return pathname.replace(/\/[^/]+$/, "");
  if (pathname === "/admin") return "/settings";
  return pathname === "/" || pathname === "" ? null : "/";
}

// Handle the back button yourself while mounted: return true to say
// "handled" (the default navigation is then skipped). The most recently
// mounted handler gets first say, so a sheet opened over a screen closes
// before the screen itself reacts.
// `first` handlers (e.g. the first-time tour, which sits over every
// screen) get their say before any screen's, whenever they were mounted.
type Handler = { current: () => boolean; first: boolean };
const handlers: Handler[] = [];

function onBack(e: Event) {
  // newest first within each group
  const order = [...handlers.filter((h) => h.first).reverse(), ...handlers.filter((h) => !h.first).reverse()];
  for (const h of order) {
    if (h.current()) {
      e.preventDefault();
      return;
    }
  }
}

export function useBackHandler(handler: () => boolean, first = false) {
  const latest = useRef<Handler>({ current: handler, first });
  latest.current.current = handler;
  useEffect(() => {
    const h = latest.current;
    if (!handlers.length) window.addEventListener(BACK_EVENT, onBack);
    handlers.push(h);
    return () => {
      handlers.splice(handlers.indexOf(h), 1);
      if (!handlers.length) window.removeEventListener(BACK_EVENT, onBack);
    };
  }, []);
}
