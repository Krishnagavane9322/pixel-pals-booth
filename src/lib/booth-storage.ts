export type Settings = {
  eventName: string;
  logoDataUrl: string | null;
  watermark: string;
  enablePrint: boolean;
  enableQR: boolean;
  countdownTime: number;
  photoGap: number;
  cameraId: string;
  exposureCompensation: number;
  manualExposure: boolean;
  exposureTime: number;
  iso: number;
  manualWhiteBalance: boolean;
  colorTemperature: number;
  tint: number;
  photoZoom: number;
  theme: "cyberpunk" | "floral";
  printLayout: "2x6" | "4x6";
  enableVoice: boolean;
  eventNameFontFamily: string;
  eventNameFontSize: number;
  eventNameColor: string;
  watermarkFontFamily: string;
  watermarkFontSize: number;
  watermarkColor: string;
};

const DEFAULTS: Settings = {
  eventName: "ROVI Live Event",
  logoDataUrl: null,
  watermark: "ROVI AI Photo Booth",
  enablePrint: true,
  enableQR: true,
  countdownTime: 3,
  photoGap: 3,
  cameraId: "",
  exposureCompensation: 0.0,
  manualExposure: false,
  exposureTime: 100,
  iso: 400,
  manualWhiteBalance: false,
  colorTemperature: 5000,
  tint: 0,
  photoZoom: 1.0,
  theme: "cyberpunk",
  printLayout: "2x6",
  enableVoice: true,
  eventNameFontFamily: "",
  eventNameFontSize: 0,
  eventNameColor: "",
  watermarkFontFamily: "",
  watermarkFontSize: 0,
  watermarkColor: "",
};

const SETTINGS_KEY = "rovi.settings";
const STRIPS_KEY = "rovi.strips";
const PRINTS_KEY = "rovi.prints";
const DLS_KEY = "rovi.downloads";

const isBrowser = () => typeof window !== "undefined";

export function getSettings(): Settings {
  if (!isBrowser()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };

    const cleaned: any = {};
    for (const key of Object.keys(DEFAULTS) as Array<keyof Settings>) {
      cleaned[key] = (parsed[key] !== undefined && parsed[key] !== null)
        ? parsed[key]
        : DEFAULTS[key];
    }
    return cleaned as Settings;
  } catch {
    return { ...DEFAULTS };
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
  if (!isBrowser()) return;
  try {
    const list = listStrips();
    // Keep last 3 strips in localStorage to stay safely under the 5MB browser quota
    const next = [rec, ...list].slice(0, 3);
    localStorage.setItem(STRIPS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[Storage] localStorage quota reached — strip skipped in local history:", e);
  }
}
export function getStrip(id: string): StripRecord | undefined {
  return listStrips().find((s) => s.id === id);
}

export function logPrint(id: string) {
  if (!isBrowser()) return;
  try {
    const list = JSON.parse(localStorage.getItem(PRINTS_KEY) || "[]");
    list.unshift({ id, at: Date.now() });
    localStorage.setItem(PRINTS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}
export function logDownload(id: string) {
  if (!isBrowser()) return;
  try {
    const list = JSON.parse(localStorage.getItem(DLS_KEY) || "[]");
    list.unshift({ id, at: Date.now() });
    localStorage.setItem(DLS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
