import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSettings, saveSettings, type Settings } from "@/lib/booth-storage";
import { X } from "lucide-react";

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
  let closestIdx = 0;
  let minDiff = Infinity;
  SHUTTER_SPEEDS.forEach((item, idx) => {
    const diff = Math.abs(item.value - val);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return closestIdx;
};

const getClosestIsoIndex = (val: number) => {
  let closestIdx = 0;
  let minDiff = Infinity;
  ISO_VALUES.forEach((item, idx) => {
    const diff = Math.abs(item - val);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  return closestIdx;
};

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
  const [showTextStyling, setShowTextStyling] = useState(false);

  useEffect(() => {
    if (open) {
      setS(getSettings());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    const updateDevices = async () => {
      try {
        let devList = await navigator.mediaDevices.enumerateDevices();
        let videoDevs = devList.filter((d) => d.kind === "videoinput");

        // If labels are empty, try to request permission to reveal labels
        if (videoDevs.length > 0 && videoDevs.every((d) => !d.label)) {
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
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className="bg-card neon-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold neon-text">Admin Settings</h2>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary"><X /></button>
            </div>

            <div className="space-y-4">
              <Field label="Event Name">
                <input
                  value={s.eventName}
                  onChange={(e) => update({ eventName: e.target.value })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2"
                />
              </Field>
              <Field label="Watermark Text">
                <input
                  value={s.watermark}
                  onChange={(e) => update({ watermark: e.target.value })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2"
                />
              </Field>
              <Field label="Event Logo">
                <input type="file" accept="image/*" onChange={handleFile("logoDataUrl")} className="text-sm" />
                {s.logoDataUrl && <img src={s.logoDataUrl} alt="logo" className="h-16 mt-2 rounded bg-white p-1" />}
              </Field>
              <Field label="Photo Strip Theme">
                <select
                  value={s.theme || "cyberpunk"}
                  onChange={(e) => update({ theme: e.target.value as "cyberpunk" | "floral" })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="cyberpunk">⚡ Cyberpunk Neon (Dark)</option>
                  <option value="floral">🌸 Pink Floral Birthday (Light)</option>
                </select>
              </Field>
              <Field label="Print Layout">
                <select
                  value={s.printLayout || "2x6"}
                  onChange={(e) => update({ printLayout: e.target.value as "2x6" | "4x6" })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="2x6">🎟️ 2" x 6" Photo Strip (3 Shots)</option>
                  <option value="4x6">🖼️ 4" x 6" Grid Print (4 Shots)</option>
                </select>
              </Field>
              <Field label="Camera Device">
                <select
                  value={s.cameraId}
                  onChange={(e) => update({ cameraId: e.target.value })}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Default (Facing User / System Default)</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera (${device.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </Field>
              {/* Exposure Section */}
              <div className="border border-border/50 rounded-xl p-4 bg-secondary/10 space-y-4">
                <h3 className="text-sm font-bold tracking-wider text-accent uppercase">Exposure Controls</h3>
                
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
                    value={s.exposureCompensation}
                    displayValue={(s.exposureCompensation > 0 ? "+" : "") + s.exposureCompensation.toFixed(1)}
                    onChange={(v) => update({ exposureCompensation: v })}
                  />
                ) : (
                  <div className="space-y-3 pl-2 border-l border-accent/20">
                    <InputSlider
                      label="Shutter Speed"
                      min={0}
                      max={SHUTTER_SPEEDS.length - 1}
                      step={1}
                      value={getClosestShutterIndex(s.exposureTime)}
                      displayValue={SHUTTER_SPEEDS[getClosestShutterIndex(s.exposureTime)].label}
                      onChange={(idx) => update({ exposureTime: SHUTTER_SPEEDS[idx].value })}
                    />
                    <InputSlider
                      label="ISO"
                      min={0}
                      max={ISO_VALUES.length - 1}
                      step={1}
                      value={getClosestIsoIndex(s.iso)}
                      displayValue={ISO_VALUES[getClosestIsoIndex(s.iso)]}
                      onChange={(idx) => update({ iso: ISO_VALUES[idx] })}
                    />
                  </div>
                )}
              </div>

              {/* White Balance Section */}
              <div className="border border-border/50 rounded-xl p-4 bg-secondary/10 space-y-4">
                <SliderToggle
                  label="White Balance"
                  value={s.manualWhiteBalance}
                  onChange={(v) => update({ manualWhiteBalance: v })}
                />

                {s.manualWhiteBalance && (
                  <div className="space-y-3 pl-2 border-l border-accent/20">
                    <InputSlider
                      label="Temperature"
                      min={2000}
                      max={8000}
                      step={50}
                      value={s.colorTemperature}
                      displayValue={`${s.colorTemperature}K`}
                      onChange={(v) => update({ colorTemperature: v })}
                    />
                    <InputSlider
                      label="Tint"
                      min={-50}
                      max={50}
                      step={1}
                      value={s.tint}
                      displayValue={(s.tint > 0 ? "+" : "") + s.tint}
                      onChange={(v) => update({ tint: v })}
                    />
                  </div>
                )}
              </div>

              {/* Informative notice for physical aperture */}
              <div className="text-xs text-amber-500/90 leading-normal border border-amber-500/20 rounded-xl p-3 bg-amber-500/5">
                ℹ️ <strong>Aperture & Lens Note:</strong> Physical camera settings like Aperture can only be adjusted directly on your camera body dial (Nikon D5600) or lens ring.
              </div>
              <Field label={`Countdown Time: ${s.countdownTime}s`}>
                <input type="range" min={1} max={10} value={s.countdownTime}
                  onChange={(e) => update({ countdownTime: +e.target.value })} className="w-full" />
              </Field>
              <Field label={`Photo Gap: ${s.photoGap}s`}>
                <input type="range" min={1} max={10} value={s.photoGap}
                  onChange={(e) => update({ photoGap: +e.target.value })} className="w-full" />
              </Field>
              <InputSlider
                label="Photo Zoom / Crop"
                min={1.0}
                max={2.5}
                step={0.05}
                value={s.photoZoom || 1.0}
                displayValue={`${(s.photoZoom || 1.0).toFixed(2)}x`}
                onChange={(v) => update({ photoZoom: v })}
              />

              {/* Text Typography & Styling Section */}
              <div className="border border-border/50 rounded-xl p-4 bg-secondary/10 space-y-4">
                <button
                  type="button"
                  onClick={() => setShowTextStyling(!showTextStyling)}
                  className="flex justify-between items-center w-full text-left font-bold tracking-wider text-accent uppercase text-sm focus:outline-none"
                >
                  <span>Text Styling Options</span>
                  <span className="text-xs">{showTextStyling ? "▼ Hide" : "▶ Show"}</span>
                </button>

                {showTextStyling && (
                  <div className="space-y-4 pt-2 border-t border-accent/10 pl-2 border-l border-accent/20">
                    {/* Event Name styling */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-foreground/90 border-b border-border/30 pb-1">Event Name Styling</h4>
                      
                      <Field label="Font Family">
                        <select
                          value={s.eventNameFontFamily || ""}
                          onChange={(e) => update({ eventNameFontFamily: e.target.value })}
                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Auto (Theme Default)</option>
                          <option value="ui-sans-serif, system-ui, sans-serif">Modern Sans</option>
                          <option value="Georgia, serif">Classic Serif</option>
                          <option value="'Brush Script MT', 'Great Vibes', cursive, sans-serif">Elegant Script</option>
                          <option value="'Courier New', Courier, monospace">Retro Mono</option>
                          <option value="'Impact', Charcoal, sans-serif">Impact Bold</option>
                        </select>
                      </Field>

                      <InputSlider
                        label="Font Size"
                        min={0} // 0 represents auto
                        max={80}
                        step={2}
                        value={s.eventNameFontSize || 0}
                        displayValue={s.eventNameFontSize === 0 ? "Auto" : `${s.eventNameFontSize}px`}
                        onChange={(v) => update({ eventNameFontSize: v })}
                      />

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <Field label="Text Color">
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={s.eventNameColor || "#ffffff"}
                                onChange={(e) => update({ eventNameColor: e.target.value })}
                                className="w-10 h-10 border-0 bg-transparent cursor-pointer"
                              />
                              <span className="text-xs text-muted-foreground">{s.eventNameColor || "Auto (Theme Default)"}</span>
                            </div>
                          </Field>
                        </div>
                        {s.eventNameColor && (
                          <button
                            type="button"
                            onClick={() => update({ eventNameColor: "" })}
                            className="mt-5 px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-input text-xs text-muted-foreground"
                          >
                            Reset to Auto
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Watermark styling */}
                    <div className="space-y-3 pt-3 border-t border-border/20">
                      <h4 className="text-sm font-bold text-foreground/90 border-b border-border/30 pb-1">Watermark Text Styling</h4>
                      
                      <Field label="Font Family">
                        <select
                          value={s.watermarkFontFamily || ""}
                          onChange={(e) => update({ watermarkFontFamily: e.target.value })}
                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Auto (Theme Default)</option>
                          <option value="ui-sans-serif, system-ui, sans-serif">Modern Sans</option>
                          <option value="Georgia, serif">Classic Serif</option>
                          <option value="'Brush Script MT', 'Great Vibes', cursive, sans-serif">Elegant Script</option>
                          <option value="'Courier New', Courier, monospace">Retro Mono</option>
                          <option value="'Impact', Charcoal, sans-serif">Impact Bold</option>
                        </select>
                      </Field>

                      <InputSlider
                        label="Font Size"
                        min={0} // 0 represents auto
                        max={60}
                        step={2}
                        value={s.watermarkFontSize || 0}
                        displayValue={s.watermarkFontSize === 0 ? "Auto" : `${s.watermarkFontSize}px`}
                        onChange={(v) => update({ watermarkFontSize: v })}
                      />

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <Field label="Text Color">
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={s.watermarkColor || "#ffffff"}
                                onChange={(e) => update({ watermarkColor: e.target.value })}
                                className="w-10 h-10 border-0 bg-transparent cursor-pointer"
                              />
                              <span className="text-xs text-muted-foreground">{s.watermarkColor || "Auto (Theme Default)"}</span>
                            </div>
                          </Field>
                        </div>
                        {s.watermarkColor && (
                          <button
                            type="button"
                            onClick={() => update({ watermarkColor: "" })}
                            className="mt-5 px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-input text-xs text-muted-foreground"
                          >
                            Reset to Auto
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <Toggle label="Enable Print" value={s.enablePrint} onChange={(v) => update({ enablePrint: v })} />
                <Toggle label="Enable QR" value={s.enableQR} onChange={(v) => update({ enableQR: v })} />
              </div>
              <Toggle label="Voice Assistant" value={s.enableVoice !== false} onChange={(v) => update({ enableVoice: v })} />
              
              {/* Wireless Remote Connection Section */}
              {tabletQr && (
                <div className="border border-border/50 rounded-xl p-4 bg-secondary/10 text-center space-y-2 mt-4">
                  <h3 className="text-sm font-bold tracking-wider text-accent uppercase text-xs">Connect Tablet Remote</h3>
                  <p className="text-[10px] text-muted-foreground">Scan this QR code with your tablet/phone to control the booth wirelessly.</p>
                  <img src={tabletQr} alt="Tablet QR" className="w-36 h-36 mx-auto rounded-lg bg-white p-2 border border-border" />
                  <a href={tabletUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline break-all block">{tabletUrl}</a>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold"
            >Done</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex-1 rounded-xl border px-3 py-3 font-semibold transition ${
        value ? "bg-primary/20 border-primary text-primary" : "bg-secondary border-border text-muted-foreground"
      }`}
    >
      {label}: {value ? "ON" : "OFF"}
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
    <div className="flex justify-between items-center py-2">
      <span className="font-semibold text-foreground text-base">{label}</span>
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
        <span className={`text-sm font-bold w-8 ${value ? "text-accent" : "text-muted-foreground"}`}>
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
    <div className="space-y-1.5 py-1">
      <div className="flex justify-between items-center text-sm font-medium">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-bold text-foreground text-sm">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
      />
    </div>
  );
}
