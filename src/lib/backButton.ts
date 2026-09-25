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
  const site = /^\/site\/([^/]+)\/(findings|export|finding\/[^/]+\/note)$/.exec(pathname);
  if (site) return site[2] === "findings" ? "/" : `/site/${site[1]}/findings`;
  // admin: keyword → list → admin menu → dashboard
  if (pathname.startsWith("/admin/")) return pathname.replace(/\/[^/]+$/, "");
  return pathname === "/" || pathname === "" ? null : "/";
}

// Handle the back button yourself while mounted: return true to say
// "handled" (the default navigation is then skipped). The most recently
// mounted handler gets first say, so a sheet opened over a screen closes
// before the screen itself reacts.
type Handler = { current: () => boolean };
const handlers: Handler[] = [];

function onBack(e: Event) {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].current()) {
      e.preventDefault();
      return;
    }
  }
}

export function useBackHandler(handler: () => boolean) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const h = latest;
    if (!handlers.length) window.addEventListener(BACK_EVENT, onBack);
    handlers.push(h);
    return () => {
      handlers.splice(handlers.indexOf(h), 1);
      if (!handlers.length) window.removeEventListener(BACK_EVENT, onBack);
    };
  }, []);
}
