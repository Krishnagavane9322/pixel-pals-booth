export type Settings = {
  eventName: string;
  logoDataUrl: string | null;
  watermark: string;
  enablePrint: boolean;
  enableQR: boolean;
  countdownTime: number;
  photoGap: number;
};

const DEFAULTS: Settings = {
  eventName: "ROVI Live Event",
  logoDataUrl: null,
  watermark: "ROVI AI Photo Booth",
  enablePrint: true,
  enableQR: true,
  countdownTime: 3,
  photoGap: 3,
};

const SETTINGS_KEY = "rovi.settings";
const STRIPS_KEY = "rovi.strips";
const PRINTS_KEY = "rovi.prints";
const DLS_KEY = "rovi.downloads";

const isBrowser = () => typeof window !== "undefined";

export function getSettings(): Settings {
  if (!isBrowser()) return DEFAULTS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export type StripRecord = { id: string; dataUrl: string; createdAt: number; eventName: string };

export function listStrips(): StripRecord[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(STRIPS_KEY) || "[]"); } catch { return []; }
}
export function saveStrip(rec: StripRecord) {
  const list = listStrips();
  // Keep last 20 to avoid storage blowup
  const next = [rec, ...list].slice(0, 20);
  localStorage.setItem(STRIPS_KEY, JSON.stringify(next));
}
export function getStrip(id: string): StripRecord | undefined {
  return listStrips().find((s) => s.id === id);
}

export function logPrint(id: string) {
  if (!isBrowser()) return;
  const list = JSON.parse(localStorage.getItem(PRINTS_KEY) || "[]");
  list.unshift({ id, at: Date.now() });
  localStorage.setItem(PRINTS_KEY, JSON.stringify(list.slice(0, 100)));
}
export function logDownload(id: string) {
  if (!isBrowser()) return;
  const list = JSON.parse(localStorage.getItem(DLS_KEY) || "[]");
  list.unshift({ id, at: Date.now() });
  localStorage.setItem(DLS_KEY, JSON.stringify(list.slice(0, 100)));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
