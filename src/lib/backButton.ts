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
  return pathname === "/" || pathname === "" ? null : "/";
}

// Handle the back button yourself while mounted: return true to say
// "handled" (the default navigation is then skipped).
export function useBackHandler(handler: () => boolean) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const onBack = (e: Event) => {
      if (latest.current()) e.preventDefault();
    };
    window.addEventListener(BACK_EVENT, onBack);
    return () => window.removeEventListener(BACK_EVENT, onBack);
  }, []);
}
