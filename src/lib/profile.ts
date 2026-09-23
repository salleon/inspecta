// The inspector's name, entered once on first launch (see Onboarding.tsx)
// and stored locally — this app has no login, so this is the only "who is
// using this device" signal it has. Used for the dashboard avatar initials
// and to label generated PDF reports.

const NAME_KEY = "inspecta.inspectorName";

export function getInspectorName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setInspectorName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // best-effort — worst case the name prompt just reappears next launch
  }
}

export function hasInspectorName(): boolean {
  return getInspectorName().trim().length > 0;
}

// "Leon Salvaggio" -> "LS"; a single-word name falls back to its first two
// letters so the avatar never ends up empty.
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
