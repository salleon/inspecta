import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import {
  AppUpdate,
  AppUpdateAvailability,
  AppUpdateResultCode,
  FlexibleUpdateInstallStatus,
  type AppUpdateInfo,
  type FlexibleUpdateState,
} from "@capawesome/capacitor-app-update";

// Updates from Google Play, inside the app: on opening, ask Play whether a
// newer version is out; if so the app offers it (UpdatePrompt), downloads
// it in the background while you keep working, then restarts into it.
// Uses Play's in-app updates, so it only does anything in the copy
// installed from Play (not the web version, nor the GitHub "Inspecta
// Test" app, which Play knows nothing about).

export type UpdateStatus =
  | "unsupported" // not the Play app (web, test app, no Play)
  | "checking"
  | "none" // up to date
  | "available"
  | "downloading"
  | "downloaded" // ready: restart to finish
  | "failed";

interface State {
  status: UpdateStatus;
  progress: number; // 0–1 while downloading
  // "Later" was pressed: no popup again until the app is next opened
  dismissed: boolean;
}

// The bits of the plugin used here, so tests can stand in for Play.
export interface UpdateBackend {
  getAppUpdateInfo(): Promise<Pick<AppUpdateInfo, "updateAvailability" | "flexibleUpdateAllowed" | "installStatus">>;
  startFlexibleUpdate(): Promise<{ code: AppUpdateResultCode }>;
  completeFlexibleUpdate(): Promise<void>;
  onStateChange(listener: (state: FlexibleUpdateState) => void): void;
}

declare global {
  interface Window {
    __appUpdateBackend?: UpdateBackend; // set by the browser tests
  }
}

function backend(): UpdateBackend | null {
  if (typeof window !== "undefined" && window.__appUpdateBackend) return window.__appUpdateBackend;
  if (Capacitor.getPlatform() !== "android") return null;
  return {
    getAppUpdateInfo: () => AppUpdate.getAppUpdateInfo(),
    startFlexibleUpdate: () => AppUpdate.startFlexibleUpdate(),
    completeFlexibleUpdate: () => AppUpdate.completeFlexibleUpdate(),
    onStateChange: (listener) => void AppUpdate.addListener("onFlexibleUpdateStateChange", listener),
  };
}

let state: State = { status: "checking", progress: 0, dismissed: false };
const subscribers = new Set<() => void>();
function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  subscribers.forEach((fn) => fn());
}

let listening = false;
function listen(b: UpdateBackend) {
  if (listening) return;
  listening = true;
  b.onStateChange((s) => {
    if (s.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) set({ status: "downloaded", progress: 1 });
    else if (s.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING || s.installStatus === FlexibleUpdateInstallStatus.PENDING) {
      const total = s.totalBytesToDownload ?? 0;
      set({ status: "downloading", progress: total > 0 ? (s.bytesDownloaded ?? 0) / total : 0 });
    } else if (s.installStatus === FlexibleUpdateInstallStatus.FAILED) set({ status: "failed" });
    else if (s.installStatus === FlexibleUpdateInstallStatus.CANCELED) set({ status: "available" });
  });
}

// Ask Play. Quiet when there's nothing to say: not the Play app, offline,
// or up to date.
export async function checkForUpdate(): Promise<UpdateStatus> {
  const b = backend();
  if (!b) {
    set({ status: "unsupported" });
    return state.status;
  }
  // don't undo a download that's under way or waiting for a restart
  if (state.status === "downloading" || state.status === "downloaded") return state.status;
  set({ status: "checking" });
  try {
    listen(b);
    const info = await b.getAppUpdateInfo();
    if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) set({ status: "downloaded", progress: 1 });
    else if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING) set({ status: "downloading" });
    else if (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE && info.flexibleUpdateAllowed !== false) set({ status: "available" });
    else set({ status: "none" });
  } catch {
    // e.g. installed from GitHub rather than Play, or no Play services
    set({ status: "unsupported" });
  }
  return state.status;
}

// "Update now": Play shows its own confirm, then downloads in the
// background (progress arrives through the listener)
export async function startUpdate() {
  const b = backend();
  if (!b || state.status !== "available") return;
  set({ status: "downloading", progress: 0, dismissed: true });
  try {
    const { code } = await b.startFlexibleUpdate();
    if (code === AppUpdateResultCode.CANCELED) set({ status: "available" });
    else if (code !== AppUpdateResultCode.OK) set({ status: "failed" });
  } catch {
    set({ status: "failed" });
  }
}

// "Restart": Play installs the download and reopens the app
export async function finishUpdate() {
  const b = backend();
  if (!b || state.status !== "downloaded") return;
  try {
    await b.completeFlexibleUpdate();
  } catch {
    set({ status: "failed" });
  }
}

export function dismissUpdate() {
  set({ dismissed: true });
}

export function useAppUpdate(): State {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}
