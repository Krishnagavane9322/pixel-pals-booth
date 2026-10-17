export type Settings = {
  eventName: string;
  logoDataUrl: string | null;
  watermark: string;
  enablePrint: boolean;
  enableQR: boolean;
  printerName: string;
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
  theme: "cyberpunk" | "floral" | "garba-midnight" | "garba-crimson";
  printLayout: "2x6" | "4x6";
  enableVoice: boolean;

  // Event Name Typography & Placement
  eventNameFontFamily: string;
  eventNameFontSize: number;
  eventNameFontWeight: string;
  eventNameColor: string;
  eventNamePlacementY: number; // Vertical offset (-150 to +150px)
  eventNamePlacementX: number; // Horizontal offset (-150 to +150px)
  eventNameLetterSpacing: number; // Letter spacing (-2 to 14px)
  eventNameAlign: "center" | "left" | "right";

  // Watermark Typography & Placement
  watermarkFontFamily: string;
  watermarkFontSize: number;
  watermarkFontWeight: string;
  watermarkColor: string;
  watermarkPlacementY: number; // Vertical offset (-150 to +150px)
  watermarkPlacementX: number; // Horizontal offset (-150 to +150px)
  watermarkLetterSpacing: number; // Letter spacing (-2 to 14px)
  watermarkAlign: "center" | "left" | "right";

  // Date Typography & Placement
  showDate: boolean;
  dateFontSize: number;
  dateColor: string;
  datePlacementY: number; // Vertical offset (-100 to +100px)
  datePlacementX: number; // Horizontal offset (-100 to +100px)

  // Logo Placement & Size
  logoSize: number; // Height in px (20 to 120, 0 = auto)
  logoPlacementY: number; // Vertical offset (-100 to +100px)
  logoPlacementX: number; // Horizontal offset (-100 to +100px)

  // Photo Strip Layout & Dimensions
  photoScale: number; // Scale factor (0.8 to 1.5, default 1.0)
  photoMarginTop: number; // Top padding of photos area (-80 to +100px)
  photoMarginSide: number; // Side margins (-50 to +50px)
  photoGapY: number; // Vertical gap between photos (-20 to 60px)
  photoBorderRadius: number; // Corner radius (0 to 40px)
  photoBorderWidth: number; // Border width (0 to 16px)
  photoBorderColor: string; // Custom border color
  footerHeight: number; // Footer area height (100 to 350px, 0 = auto)
};

const DEFAULTS: Settings = {
  eventName: "ROVI Live Event",
  logoDataUrl: null,
  watermark: "ROVI AI Photo Booth",
  enablePrint: true,
  enableQR: true,
  printerName: "DS-RX1",
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
  eventNameFontWeight: "",
  eventNameColor: "",
  eventNamePlacementY: 0,
  eventNamePlacementX: 0,
  eventNameLetterSpacing: 0,
  eventNameAlign: "center",

  watermarkFontFamily: "",
  watermarkFontSize: 0,
  watermarkFontWeight: "",
  watermarkColor: "",
  watermarkPlacementY: 0,
  watermarkPlacementX: 0,
  watermarkLetterSpacing: 0,
  watermarkAlign: "center",

  showDate: true,
  dateFontSize: 0,
  dateColor: "",
  datePlacementY: 0,
  datePlacementX: 0,

  logoSize: 0,
  logoPlacementY: 0,
  logoPlacementX: 0,

  photoScale: 1.0,
  photoMarginTop: 0,
  photoMarginSide: 0,
  photoGapY: 0,
  photoBorderRadius: 0,
  photoBorderWidth: 0,
  photoBorderColor: "",
  footerHeight: 0,
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
      cleaned[key] =
        parsed[key] !== undefined && parsed[key] !== null ? parsed[key] : DEFAULTS[key];
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
  try {
    return JSON.parse(localStorage.getItem(STRIPS_KEY) || "[]");
  } catch {
    return [];
  }
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
