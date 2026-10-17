import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSettings, saveSettings, type Settings } from "@/lib/booth-storage";
import { buildStrip } from "@/lib/strip";
import {
  X,
  Palette,
  Type,
  Camera,
  Sliders,
  RefreshCw,
  Eye,
  Sparkles,
  ZoomIn,
  Move,
  LayoutGrid,
  Check,
  Undo,
  Layers,
  Image as ImageIcon,
} from "lucide-react";

const SHUTTER_SPEEDS = [
  { label: "1/1000s", value: 10 },
  { label: "1/800s", value: 12 },
  { label: "1/640s", value: 15 },
  { label: "1/500s", value: 20 },
  { label: "1/400s", value: 25 },
  { label: "1/320s", value: 31 },
  { label: "1/250s", value: 40 },
  { label: "1/200s", value: 50 },
  { label: "1/160s", value: 62 },
  { label: "1/125s", value: 80 },
  { label: "1/100s", value: 100 },
  { label: "1/80s", value: 125 },
  { label: "1/60s", value: 166 },
  { label: "1/50s", value: 200 },
  { label: "1/40s", value: 250 },
  { label: "1/30s", value: 333 },
  { label: "1/25s", value: 400 },
  { label: "1/20s", value: 500 },
  { label: "1/15s", value: 666 },
  { label: "1/13s", value: 769 },
  { label: "1/10s", value: 1000 },
  { label: "1/8s", value: 1250 },
  { label: "1/6s", value: 1666 },
  { label: "1/5s", value: 2000 },
  { label: "1/4s", value: 2500 },
  { label: "1/3s", value: 3333 },
  { label: "1/2s", value: 5000 },
  { label: "1s", value: 10000 },
];

const ISO_VALUES = [100, 200, 400, 800, 1600, 3200, 6400];

const getClosestShutterIndex = (val: number) => {
  const safeVal = typeof val === "number" && !isNaN(val) ? val : 100;
  let closestIdx = 0;
  let minDiff = Infinity;
  SHUTTER_SPEEDS.forEach((item, idx) => {
    const diff = Math.abs(item.value - safeVal);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return closestIdx;
};

const getClosestIsoIndex = (val: number) => {
  const safeVal = typeof val === "number" && !isNaN(val) ? val : 400;
  let closestIdx = 0;
  let minDiff = Infinity;
  ISO_VALUES.forEach((item, idx) => {
    const diff = Math.abs(item - safeVal);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return closestIdx;
};

// Generate vivid portrait placeholder photos for real-time preview
function createSamplePhoto(label: string, hue: number): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 480;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 600, 480);
  grad.addColorStop(0, `hsl(${hue}, 60%, 42%)`);
  grad.addColorStop(1, `hsl(${hue + 45}, 70%, 22%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 480);

  // Soft portrait head & shoulders silhouette
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.arc(300, 190, 85, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(300, 410, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "bold 26px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`📸 ${label}`, 300, 440);
  return c.toDataURL("image/jpeg", 0.85);
}

export function AdminPanel({
  open,
  onClose,
  tabletQr,
  tabletUrl,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tabletQr?: string;
  tabletUrl?: string;
  onSave?: (settings: Settings) => void;
}) {
  const [s, setS] = useState<Settings>(() => getSettings());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"strip" | "typography" | "camera">("strip");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<"controls" | "preview">("controls");

  // Load settings when modal opens
  useEffect(() => {
    if (open) {
      setS(getSettings());
    }
  }, [open]);

  // Live real-time preview debounced generation
  useEffect(() => {
    if (!open) return;
    let active = true;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const p1 = createSamplePhoto("Pose 1", 335); // Magenta/Pink
        const p2 = createSamplePhoto("Pose 2", 215); // Cyan/Teal
        const p3 = createSamplePhoto("Pose 3", 42);  // Gold/Amber
        const p4 = createSamplePhoto("Pose 4", 280); // Purple
        const photos = s.printLayout === "4x6" ? [p1, p2, p3, p4] : [p1, p2, p3];
        const url = await buildStrip(photos, s);
        if (active) {
          setPreviewUrl(url);
          setPreviewLoading(false);
        }
      } catch (err) {
        console.warn("[AdminPanel] Live preview generation error:", err);
        if (active) setPreviewLoading(false);
      }
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, s]);

  // Camera device enumeration
  useEffect(() => {
    if (!open) return;
    let active = true;

    const updateDevices = async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
          return;
        }
        let devList = await navigator.mediaDevices.enumerateDevices();
        let videoDevs = devList.filter((d) => d.kind === "videoinput");

        if (
          videoDevs.length > 0 &&
          videoDevs.every((d) => !d.label) &&
          navigator.mediaDevices.getUserMedia
        ) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((track) => track.stop());
            devList = await navigator.mediaDevices.enumerateDevices();
            videoDevs = devList.filter((d) => d.kind === "videoinput");
          } catch (permErr) {
            console.warn("Could not get permission to label cameras:", permErr);
          }
        }

        if (active) {
          setDevices(videoDevs);
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    };

    updateDevices();
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", updateDevices);
    }
    return () => {
      active = false;
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
      }
    };
  }, [open]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    if (onSave) onSave(next);
  };

  const handleFile = (key: "logoDataUrl") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => update({ [key]: r.result as string } as Partial<Settings>);
    r.readAsDataURL(f);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-card border border-border/80 neon-border rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header with Tabs and Close Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 p-4 gap-3 bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-xl shadow">
                  ⚙️
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                    Photo Booth Admin & Design Studio
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Customize photo sizing, typography, placements, themes & hardware
                  </p>
                </div>
              </div>

              {/* Main Navigation Tabs */}
              <div className="flex items-center gap-1.5 bg-background/80 p-1 rounded-xl border border-border/60 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab("strip")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "strip"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Strip & Photo Size</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("typography")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "typography"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>Typography & Placement</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("camera")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "camera"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera & Print</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition absolute sm:static right-4 top-4"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Tab Switcher (Controls vs Live Preview) */}
            <div className="flex lg:hidden border-b border-border/40 bg-secondary/20 p-2 justify-center gap-2">
              <button
                type="button"
                onClick={() => setMobileTab("controls")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold text-center ${
                  mobileTab === "controls"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground bg-background/50"
                }`}
              >
                🛠️ Settings Controls
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("preview")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold text-center flex items-center justify-center gap-1.5 ${
                  mobileTab === "preview"
                    ? "bg-accent text-accent-foreground shadow"
                    : "text-muted-foreground bg-background/50"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Strip Preview
              </button>
            </div>

            {/* Modal Body: Two-Column Studio Layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Column: Form Controls (Scrollable) */}
              <div
                className={`flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 ${
                  mobileTab === "preview" ? "hidden lg:block" : "block"
                }`}
              >
                {/* ================= TAB 1: STRIP & PHOTO SIZE ================= */}
                {activeTab === "strip" && (
                  <div className="space-y-6">
                    {/* Theme & Layout Selectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Photo Strip Theme">
                        <select
                          value={s.theme || "cyberpunk"}
                          onChange={(e) =>
                            update({
                              theme: e.target.value as Settings["theme"],
                            })
                          }
                          className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="garba-midnight">✨ Royal Midnight Garba (Navy & Gold)</option>
                          <option value="garba-crimson">🔥 Royal Crimson Garba (Red & Gold)</option>
                          <option value="cyberpunk">⚡ Cyberpunk Neon (Dark)</option>
                          <option value="floral">🌸 Pink Floral Birthday (Light)</option>
                        </select>
                      </Field>

                      <Field label="Print Layout">
                        <select
                          value={s.printLayout || "2x6"}
                          onChange={(e) => update({ printLayout: e.target.value as "2x6" | "4x6" })}
                          className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="2x6">🎟️ 2" x 6" Photo Strip (3 Shots)</option>
                          <option value="4x6">🖼️ 4" x 6" Grid Print (4 Shots)</option>
                        </select>
                      </Field>
                    </div>

                    {/* Photo Sizing & Scale Section */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-2">
                          <ZoomIn className="w-4 h-4 text-primary" />
                          <h3 className="text-sm font-bold tracking-wider text-foreground uppercase">
                            Photo Size & Prominence On Strip
                          </h3>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          Grand Sizing
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Control how large the photos appear on the photo strip. Boost scale so guests' faces are bold, clear, and prominent!
                      </p>

                      {/* Quick Photo Scale Presets */}
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground font-medium">Quick Photo Size Presets:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: "Compact", scale: 0.95 },
                            { label: "Standard (100%)", scale: 1.0 },
                            { label: "Large (115%)", scale: 1.15 },
                            { label: "Maximized (130%)", scale: 1.3 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => update({ photoScale: preset.scale })}
                              className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition text-center ${
                                Math.abs((s.photoScale || 1.0) - preset.scale) < 0.04
                                  ? "bg-primary border-primary text-primary-foreground shadow"
                                  : "bg-input border-border/60 text-foreground hover:bg-secondary"
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Photo Scale Slider */}
                      <InputSlider
                        label="Photo Scale / Size Multiplier"
                        min={0.8}
                        max={1.5}
                        step={0.02}
                        value={s.photoScale || 1.0}
                        displayValue={`${Math.round((s.photoScale || 1.0) * 100)}%`}
                        onChange={(v) => update({ photoScale: v })}
                      />

                      {/* Photo Zoom / Crop */}
                      <InputSlider
                        label="Camera Photo Zoom (Crop Closer to Faces)"
                        min={1.0}
                        max={2.5}
                        step={0.05}
                        value={s.photoZoom || 1.0}
                        displayValue={`${(s.photoZoom || 1.0).toFixed(2)}x`}
                        onChange={(v) => update({ photoZoom: v })}
                      />

                      {/* Reset Photo Sizing Button */}
                      {(s.photoScale !== 1.0 || (s.photoZoom || 1.0) !== 1.0) && (
                        <button
                          type="button"
                          onClick={() => update({ photoScale: 1.0, photoZoom: 1.0 })}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline pt-1"
                        >
                          <Undo className="w-3 h-3" /> Reset Photo Size to Default
                        </button>
                      )}
                    </div>

                    {/* Photo Spacing, Margins & Padding Section */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                        <Move className="w-4 h-4 text-accent" />
                        <h3 className="text-sm font-bold tracking-wider text-foreground uppercase">
                          Photo Margins, Spacing & Padding
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputSlider
                          label="Side Margin / Padding"
                          min={-40}
                          max={50}
                          step={2}
                          value={s.photoMarginSide ?? 0}
                          displayValue={`${(s.photoMarginSide ?? 0) > 0 ? "+" : ""}${s.photoMarginSide ?? 0}px`}
                          onChange={(v) => update({ photoMarginSide: v })}
                        />

                        <InputSlider
                          label="Top Margin / Offset"
                          min={-60}
                          max={80}
                          step={2}
                          value={s.photoMarginTop ?? 0}
                          displayValue={`${(s.photoMarginTop ?? 0) > 0 ? "+" : ""}${s.photoMarginTop ?? 0}px`}
                          onChange={(v) => update({ photoMarginTop: v })}
                        />

                        <InputSlider
                          label="Vertical Gap Between Photos"
                          min={-20}
                          max={60}
                          step={2}
                          value={s.photoGapY ?? 0}
                          displayValue={`${(s.photoGapY ?? 0) > 0 ? "+" : ""}${s.photoGapY ?? 0}px`}
                          onChange={(v) => update({ photoGapY: v })}
                        />

                        <InputSlider
                          label="Photo Corner Radius (Curvature)"
                          min={0}
                          max={40}
                          step={2}
                          value={s.photoBorderRadius ?? 0}
                          displayValue={`${s.photoBorderRadius ?? 0}px`}
                          onChange={(v) => update({ photoBorderRadius: v })}
                        />
                      </div>

                      {/* Photo Borders & Framing */}
                      <div className="pt-2 border-t border-border/30 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <InputSlider
                          label="Photo Outer Border Thickness"
                          min={0}
                          max={16}
                          step={1}
                          value={s.photoBorderWidth ?? 0}
                          displayValue={s.photoBorderWidth ? `${s.photoBorderWidth}px` : "Theme Default"}
                          onChange={(v) => update({ photoBorderWidth: v })}
                        />

                        <Field label="Custom Photo Border Color">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={s.photoBorderColor || "#d4af37"}
                              onChange={(e) => update({ photoBorderColor: e.target.value })}
                              className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                            />
                            <span className="text-xs text-muted-foreground font-mono">
                              {s.photoBorderColor || "Auto (Gold/Theme)"}
                            </span>
                            {s.photoBorderColor && (
                              <button
                                type="button"
                                onClick={() => update({ photoBorderColor: "" })}
                                className="text-xs text-primary underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </Field>
                      </div>

                      {/* Footer Area Height */}
                      <div className="pt-2 border-t border-border/30">
                        <InputSlider
                          label="Footer Area Height"
                          min={120}
                          max={350}
                          step={10}
                          value={s.footerHeight || (s.printLayout === "4x6" ? 160 : 200)}
                          displayValue={s.footerHeight ? `${s.footerHeight}px` : "Auto"}
                          onChange={(v) => update({ footerHeight: v })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= TAB 2: TYPOGRAPHY & PLACEMENT ================= */}
                {activeTab === "typography" && (
                  <div className="space-y-6">
                    {/* Event Name Typography & Placement */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-2">
                          <Type className="w-4 h-4 text-primary" />
                          <h3 className="text-sm font-bold tracking-wider text-foreground uppercase">
                            Event Name Text & Design
                          </h3>
                        </div>
                        <span className="text-xs font-semibold text-primary">Main Title</span>
                      </div>

                      <Field label="Event Name Text">
                        <input
                          value={s.eventName}
                          onChange={(e) => update({ eventName: e.target.value })}
                          placeholder="e.g. Navratri Dandiya Raas 2026"
                          className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Font Family">
                          <select
                            value={s.eventNameFontFamily || ""}
                            onChange={(e) => update({ eventNameFontFamily: e.target.value })}
                            className="w-full bg-input border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="">Auto (Theme Default)</option>
                            <option value="'Cinzel', Georgia, serif">👑 Royal Cinzel (Festive / Grand)</option>
                            <option value="'Playfair Display', Georgia, serif">📜 Playfair Display (Luxury Serif)</option>
                            <option value="'Brush Script MT', 'Great Vibes', cursive, sans-serif">🌸 Elegant Script (Cursive)</option>
                            <option value="ui-sans-serif, system-ui, sans-serif">⚡ Modern Bold Sans</option>
                            <option value="Georgia, serif">🏛️ Classic Serif</option>
                            <option value="'Impact', Charcoal, sans-serif">💥 Bold Impact</option>
                            <option value="'Courier New', Courier, monospace">📟 Retro Mono</option>
                          </select>
                        </Field>

                        <Field label="Font Weight">
                          <select
                            value={s.eventNameFontWeight || ""}
                            onChange={(e) => update({ eventNameFontWeight: e.target.value })}
                            className="w-full bg-input border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="">Auto (Theme Default)</option>
                            <option value="normal">Normal (400)</option>
                            <option value="medium">Medium (500)</option>
                            <option value="600">Semi-Bold (600)</option>
                            <option value="bold">Bold (700)</option>
                            <option value="800">Extra-Bold (800)</option>
                          </select>
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputSlider
                          label="Font Size"
                          min={0}
                          max={90}
                          step={2}
                          value={s.eventNameFontSize || 0}
                          displayValue={s.eventNameFontSize === 0 ? "Auto" : `${s.eventNameFontSize}px`}
                          onChange={(v) => update({ eventNameFontSize: v })}
                        />

                        <InputSlider
                          label="Letter Spacing"
                          min={-2}
                          max={14}
                          step={1}
                          value={s.eventNameLetterSpacing ?? 0}
                          displayValue={`${s.eventNameLetterSpacing ?? 0}px`}
                          onChange={(v) => update({ eventNameLetterSpacing: v })}
                        />
                      </div>

                      {/* Positioning / Placement */}
                      <div className="pt-3 border-t border-border/30 space-y-3">
                        <span className="text-xs font-bold text-accent uppercase tracking-wider block">
                          📍 Event Name Position & Margins
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                          <Field label="Text Alignment">
                            <div className="flex rounded-xl bg-input border border-border p-1 gap-1">
                              {(["left", "center", "right"] as const).map((align) => (
                                <button
                                  key={align}
                                  type="button"
                                  onClick={() => update({ eventNameAlign: align })}
                                  className={`flex-1 py-1 rounded-lg text-xs font-bold capitalize transition ${
                                    (s.eventNameAlign || "center") === align
                                      ? "bg-primary text-primary-foreground shadow"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {align}
                                </button>
                              ))}
                            </div>
                          </Field>

                          <InputSlider
                            label="Vertical Placement (Y Offset)"
                            min={-150}
                            max={150}
                            step={2}
                            value={s.eventNamePlacementY ?? 0}
                            displayValue={`${(s.eventNamePlacementY ?? 0) > 0 ? "+" : ""}${s.eventNamePlacementY ?? 0}px`}
                            onChange={(v) => update({ eventNamePlacementY: v })}
                          />

                          <InputSlider
                            label="Horizontal Offset (X Offset)"
                            min={-150}
                            max={150}
                            step={2}
                            value={s.eventNamePlacementX ?? 0}
                            displayValue={`${(s.eventNamePlacementX ?? 0) > 0 ? "+" : ""}${s.eventNamePlacementX ?? 0}px`}
                            onChange={(v) => update({ eventNamePlacementX: v })}
                          />
                        </div>

                        <Field label="Text Color">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={s.eventNameColor || "#ffd700"}
                              onChange={(e) => update({ eventNameColor: e.target.value })}
                              className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                            />
                            <span className="text-xs text-muted-foreground font-mono">
                              {s.eventNameColor || "Auto (Royal Gold)"}
                            </span>
                            {s.eventNameColor && (
                              <button
                                type="button"
                                onClick={() => update({ eventNameColor: "" })}
                                className="text-xs text-primary underline"
                              >
                                Reset to Auto
                              </button>
                            )}
                          </div>
                        </Field>
                      </div>
                    </div>

                    {/* Watermark / Subtitle Typography & Placement */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-2">
                          <Type className="w-4 h-4 text-accent" />
                          <h3 className="text-sm font-bold tracking-wider text-foreground uppercase">
                            Watermark / Event Subtitle Design
                          </h3>
                        </div>
                        <span className="text-xs font-semibold text-accent">Subtitle</span>
                      </div>

                      <Field label="Watermark / Subtitle Text">
                        <input
                          value={s.watermark}
                          onChange={(e) => update({ watermark: e.target.value })}
                          placeholder="e.g. Photo Yatra • AI Photo Booth"
                          className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Font Family">
                          <select
                            value={s.watermarkFontFamily || ""}
                            onChange={(e) => update({ watermarkFontFamily: e.target.value })}
                            className="w-full bg-input border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="">Auto (Theme Default)</option>
                            <option value="'Cinzel', Georgia, serif">👑 Royal Cinzel (Festive / Grand)</option>
                            <option value="'Playfair Display', Georgia, serif">📜 Playfair Display (Luxury Serif)</option>
                            <option value="'Brush Script MT', 'Great Vibes', cursive, sans-serif">🌸 Elegant Script (Cursive)</option>
                            <option value="ui-sans-serif, system-ui, sans-serif">⚡ Modern Bold Sans</option>
                            <option value="Georgia, serif">🏛️ Classic Serif</option>
                            <option value="'Impact', Charcoal, sans-serif">💥 Bold Impact</option>
                            <option value="'Courier New', Courier, monospace">📟 Retro Mono</option>
                          </select>
                        </Field>

                        <Field label="Font Weight">
                          <select
                            value={s.watermarkFontWeight || ""}
                            onChange={(e) => update({ watermarkFontWeight: e.target.value })}
                            className="w-full bg-input border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          >
                            <option value="">Auto (Theme Default)</option>
                            <option value="normal">Normal (400)</option>
                            <option value="medium">Medium (500)</option>
                            <option value="600">Semi-Bold (600)</option>
                            <option value="bold">Bold (700)</option>
                          </select>
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputSlider
                          label="Font Size"
                          min={0}
                          max={70}
                          step={2}
                          value={s.watermarkFontSize || 0}
                          displayValue={s.watermarkFontSize === 0 ? "Auto" : `${s.watermarkFontSize}px`}
                          onChange={(v) => update({ watermarkFontSize: v })}
                        />

                        <InputSlider
                          label="Letter Spacing"
                          min={-2}
                          max={14}
                          step={1}
                          value={s.watermarkLetterSpacing ?? 0}
                          displayValue={`${s.watermarkLetterSpacing ?? 0}px`}
                          onChange={(v) => update({ watermarkLetterSpacing: v })}
                        />
                      </div>

                      {/* Watermark Placement */}
                      <div className="pt-3 border-t border-border/30 space-y-3">
                        <span className="text-xs font-bold text-accent uppercase tracking-wider block">
                          📍 Watermark Position & Margins
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                          <Field label="Text Alignment">
                            <div className="flex rounded-xl bg-input border border-border p-1 gap-1">
                              {(["left", "center", "right"] as const).map((align) => (
                                <button
                                  key={align}
                                  type="button"
                                  onClick={() => update({ watermarkAlign: align })}
                                  className={`flex-1 py-1 rounded-lg text-xs font-bold capitalize transition ${
                                    (s.watermarkAlign || "center") === align
                                      ? "bg-primary text-primary-foreground shadow"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {align}
                                </button>
                              ))}
                            </div>
                          </Field>

                          <InputSlider
                            label="Vertical Placement (Y Offset)"
                            min={-150}
                            max={150}
                            step={2}
                            value={s.watermarkPlacementY ?? 0}
                            displayValue={`${(s.watermarkPlacementY ?? 0) > 0 ? "+" : ""}${s.watermarkPlacementY ?? 0}px`}
                            onChange={(v) => update({ watermarkPlacementY: v })}
                          />

                          <InputSlider
                            label="Horizontal Offset (X Offset)"
                            min={-150}
                            max={150}
                            step={2}
                            value={s.watermarkPlacementX ?? 0}
                            displayValue={`${(s.watermarkPlacementX ?? 0) > 0 ? "+" : ""}${s.watermarkPlacementX ?? 0}px`}
                            onChange={(v) => update({ watermarkPlacementX: v })}
                          />
                        </div>

                        <Field label="Text Color">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={s.watermarkColor || "#ffe57f"}
                              onChange={(e) => update({ watermarkColor: e.target.value })}
                              className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                            />
                            <span className="text-xs text-muted-foreground font-mono">
                              {s.watermarkColor || "Auto (Shimmering Gold)"}
                            </span>
                            {s.watermarkColor && (
                              <button
                                type="button"
                                onClick={() => update({ watermarkColor: "" })}
                                className="text-xs text-primary underline"
                              >
                                Reset to Auto
                              </button>
                            )}
                          </div>
                        </Field>
                      </div>
                    </div>

                    {/* Date & Event Logo Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Date Controls */}
                      <div className="border border-border/70 rounded-2xl p-4 bg-secondary/15 space-y-3">
                        <div className="flex items-center justify-between border-b border-border/40 pb-2">
                          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                            📅 Date Display
                          </h4>
                          <Toggle
                            label=""
                            value={s.showDate !== false}
                            onChange={(v) => update({ showDate: v })}
                          />
                        </div>

                        {s.showDate !== false && (
                          <div className="space-y-3 pt-1">
                            <InputSlider
                              label="Date Font Size"
                              min={10}
                              max={36}
                              step={1}
                              value={s.dateFontSize || 16}
                              displayValue={`${s.dateFontSize || 16}px`}
                              onChange={(v) => update({ dateFontSize: v })}
                            />
                            <InputSlider
                              label="Date Vertical Offset (Y)"
                              min={-100}
                              max={100}
                              step={2}
                              value={s.datePlacementY ?? 0}
                              displayValue={`${(s.datePlacementY ?? 0) > 0 ? "+" : ""}${s.datePlacementY ?? 0}px`}
                              onChange={(v) => update({ datePlacementY: v })}
                            />
                            <Field label="Date Color">
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={s.dateColor || "#d4af37"}
                                  onChange={(e) => update({ dateColor: e.target.value })}
                                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                />
                                <span className="text-xs text-muted-foreground font-mono">
                                  {s.dateColor || "Auto"}
                                </span>
                              </div>
                            </Field>
                          </div>
                        )}
                      </div>

                      {/* Event Logo Controls */}
                      <div className="border border-border/70 rounded-2xl p-4 bg-secondary/15 space-y-3">
                        <div className="flex items-center justify-between border-b border-border/40 pb-2">
                          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                            🖼️ Event Logo
                          </h4>
                          {s.logoDataUrl && (
                            <button
                              type="button"
                              onClick={() => update({ logoDataUrl: null })}
                              className="text-[10px] text-destructive hover:underline font-bold"
                            >
                              Remove Logo
                            </button>
                          )}
                        </div>

                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFile("logoDataUrl")}
                          className="text-xs w-full file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                        />

                        {s.logoDataUrl && (
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center gap-3">
                              <img
                                src={s.logoDataUrl}
                                alt="logo"
                                className="h-10 w-auto rounded bg-white p-1 border border-border"
                              />
                              <InputSlider
                                label="Logo Height"
                                min={20}
                                max={120}
                                step={2}
                                value={s.logoSize || 50}
                                displayValue={`${s.logoSize || 50}px`}
                                onChange={(v) => update({ logoSize: v })}
                              />
                            </div>
                            <InputSlider
                              label="Logo Vertical Offset (Y)"
                              min={-100}
                              max={100}
                              step={2}
                              value={s.logoPlacementY ?? 0}
                              displayValue={`${(s.logoPlacementY ?? 0) > 0 ? "+" : ""}${s.logoPlacementY ?? 0}px`}
                              onChange={(v) => update({ logoPlacementY: v })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= TAB 3: CAMERA & HARDWARE ================= */}
                {activeTab === "camera" && (
                  <div className="space-y-6">
                    {/* Camera Device Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Camera Video Input</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (!navigator.mediaDevices?.enumerateDevices) return;
                              let devList = await navigator.mediaDevices.enumerateDevices();
                              let videoDevs = devList.filter((d) => d.kind === "videoinput");
                              if (
                                videoDevs.length > 0 &&
                                videoDevs.every((d) => !d.label) &&
                                navigator.mediaDevices.getUserMedia
                              ) {
                                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                stream.getTracks().forEach((track) => track.stop());
                                devList = await navigator.mediaDevices.enumerateDevices();
                                videoDevs = devList.filter((d) => d.kind === "videoinput");
                              }
                              setDevices(videoDevs);
                            } catch (err) {
                              console.warn("Failed to refresh camera list:", err);
                            }
                          }}
                          className="text-xs text-primary hover:underline font-bold flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Refresh Camera List
                        </button>
                      </div>
                      <select
                        value={s.cameraId}
                        onChange={(e) => {
                          if (typeof window !== "undefined" && (window as any).__roviCameraStream) {
                            try {
                              ((window as any).__roviCameraStream as MediaStream)
                                .getTracks()
                                .forEach((t) => t.stop());
                            } catch {}
                            delete (window as any).__roviCameraStream;
                          }
                          update({ cameraId: e.target.value });
                        }}
                        className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Default (System Default / Facing User)</option>
                        {devices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Camera (${device.deviceId.slice(0, 5)}...)`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Exposure Section */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <h3 className="text-sm font-bold tracking-wider text-accent uppercase">
                        Exposure Controls
                      </h3>

                      <SliderToggle
                        label="Manual Exposure"
                        value={s.manualExposure}
                        onChange={(v) => update({ manualExposure: v })}
                      />

                      {!s.manualExposure ? (
                        <InputSlider
                          label="Exposure Compensation"
                          min={-3.0}
                          max={3.0}
                          step={0.1}
                          value={s.exposureCompensation ?? 0}
                          displayValue={
                            ((s.exposureCompensation ?? 0) > 0 ? "+" : "") +
                            (s.exposureCompensation ?? 0).toFixed(1)
                          }
                          onChange={(v) => update({ exposureCompensation: v })}
                        />
                      ) : (
                        <div className="space-y-3 pl-2 border-l border-accent/30">
                          <InputSlider
                            label="Shutter Speed"
                            min={0}
                            max={SHUTTER_SPEEDS.length - 1}
                            step={1}
                            value={getClosestShutterIndex(s.exposureTime ?? 100)}
                            displayValue={
                              SHUTTER_SPEEDS[getClosestShutterIndex(s.exposureTime ?? 100)]?.label ||
                              "1/100s"
                            }
                            onChange={(idx) =>
                              update({ exposureTime: SHUTTER_SPEEDS[idx]?.value ?? 100 })
                            }
                          />
                          <InputSlider
                            label="ISO"
                            min={0}
                            max={ISO_VALUES.length - 1}
                            step={1}
                            value={getClosestIsoIndex(s.iso ?? 400)}
                            displayValue={ISO_VALUES[getClosestIsoIndex(s.iso ?? 400)] ?? 400}
                            onChange={(idx) => update({ iso: ISO_VALUES[idx] ?? 400 })}
                          />
                        </div>
                      )}
                    </div>

                    {/* White Balance Section */}
                    <div className="border border-border/70 rounded-2xl p-4 sm:p-5 bg-secondary/15 space-y-4">
                      <SliderToggle
                        label="White Balance"
                        value={s.manualWhiteBalance}
                        onChange={(v) => update({ manualWhiteBalance: v })}
                      />

                      {s.manualWhiteBalance && (
                        <div className="space-y-3 pl-2 border-l border-accent/30">
                          <InputSlider
                            label="Temperature"
                            min={2000}
                            max={8000}
                            step={50}
                            value={s.colorTemperature ?? 5000}
                            displayValue={`${s.colorTemperature ?? 5000}K`}
                            onChange={(v) => update({ colorTemperature: v })}
                          />
                          <InputSlider
                            label="Tint"
                            min={-50}
                            max={50}
                            step={1}
                            value={s.tint ?? 0}
                            displayValue={((s.tint ?? 0) > 0 ? "+" : "") + (s.tint ?? 0)}
                            onChange={(v) => update({ tint: v })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Timings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputSlider
                        label="Countdown Timer"
                        min={1}
                        max={10}
                        step={1}
                        value={s.countdownTime ?? 3}
                        displayValue={`${s.countdownTime ?? 3}s`}
                        onChange={(v) => update({ countdownTime: v })}
                      />

                      <InputSlider
                        label="Pose Gap Between Shots"
                        min={1}
                        max={10}
                        step={1}
                        value={s.photoGap ?? 3}
                        displayValue={`${s.photoGap ?? 3}s`}
                        onChange={(v) => update({ photoGap: v })}
                      />
                    </div>

                    {/* Printer Settings */}
                    <Field label="Target Printer Name (Silent Direct Spooler)">
                      <input
                        value={s.printerName || "DS-RX1"}
                        onChange={(e) => update({ printerName: e.target.value })}
                        placeholder="DS-RX1"
                        className="w-full bg-input border border-border rounded-xl px-3 py-2 text-foreground font-mono text-sm"
                      />
                    </Field>

                    {/* Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Toggle
                        label="Print Button"
                        value={s.enablePrint}
                        onChange={(v) => update({ enablePrint: v })}
                      />
                      <Toggle
                        label="QR Code"
                        value={s.enableQR}
                        onChange={(v) => update({ enableQR: v })}
                      />
                      <Toggle
                        label="Voice Sound"
                        value={s.enableVoice !== false}
                        onChange={(v) => update({ enableVoice: v })}
                      />
                    </div>

                    {/* Wireless Remote Connection */}
                    {tabletQr && (
                      <div className="border border-border/70 rounded-2xl p-4 bg-secondary/15 text-center space-y-2">
                        <h3 className="text-xs font-bold tracking-wider text-accent uppercase">
                          Connect Tablet Remote
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          Scan with your iPad / tablet to trigger captures remotely.
                        </p>
                        <img
                          src={tabletQr}
                          alt="Tablet QR"
                          className="w-32 h-32 mx-auto rounded-xl bg-white p-2 border border-border shadow"
                        />
                        <a
                          href={tabletUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline break-all block"
                        >
                          {tabletUrl}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Real-Time Live Strip Preview */}
              <div
                className={`w-full lg:w-80 xl:w-96 border-l border-border/60 bg-black/40 p-4 flex flex-col items-center justify-between shrink-0 overflow-y-auto ${
                  mobileTab === "controls" ? "hidden lg:flex" : "flex"
                }`}
              >
                <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Eye className="w-4 h-4 text-primary" />
                    <span>Live Strip Preview</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                    {s.printLayout === "4x6" ? "4×6 Grid" : "2×6 Strip (300 DPI)"}
                  </span>
                </div>

                <div className="flex-1 w-full flex items-center justify-center p-2 relative min-h-[360px]">
                  {previewLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs rounded-xl text-primary text-xs font-semibold gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span>Updating strip...</span>
                    </div>
                  )}

                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Live Strip Preview"
                      className="max-h-[58vh] sm:max-h-[64vh] w-auto rounded-xl shadow-2xl border border-white/20 object-contain bg-white"
                    />
                  ) : (
                    <div className="text-center text-xs text-muted-foreground">
                      Rendering live preview…
                    </div>
                  )}
                </div>

                <div className="w-full pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Photo Scale: {Math.round((s.photoScale || 1.0) * 100)}%</span>
                  <span>Zoom: {(s.photoZoom || 1.0).toFixed(2)}x</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border/60 p-4 bg-secondary/30 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                ✨ All changes are auto-saved in real-time.
              </span>
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-2.5 font-bold shadow-lg transition"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-foreground/80 mb-1">{label}</div>
      {children}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`rounded-xl border px-3 py-2.5 font-bold text-xs transition flex items-center justify-between gap-2 ${
        value
          ? "bg-primary/20 border-primary text-primary shadow"
          : "bg-input border-border/70 text-muted-foreground hover:bg-secondary"
      }`}
    >
      <span>{label}</span>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {value ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function SliderToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="font-semibold text-foreground text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            value ? "bg-accent" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-xs font-bold w-7 ${value ? "text-accent" : "text-muted-foreground"}`}
        >
          {value ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
}

function InputSlider({
  label,
  min,
  max,
  step = 1,
  value,
  displayValue,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  displayValue: string | number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1 py-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-foreground/80 font-medium">{label}</span>
        <span className="font-bold text-primary font-mono text-xs">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}
