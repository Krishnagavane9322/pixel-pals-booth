import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSettings, saveSettings, type Settings } from "@/lib/booth-storage";
import { X } from "lucide-react";

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS] = useState<Settings>(() => getSettings());

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
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
              <Field label={`Countdown Time: ${s.countdownTime}s`}>
                <input type="range" min={1} max={10} value={s.countdownTime}
                  onChange={(e) => update({ countdownTime: +e.target.value })} className="w-full" />
              </Field>
              <Field label={`Photo Gap: ${s.photoGap}s`}>
                <input type="range" min={1} max={10} value={s.photoGap}
                  onChange={(e) => update({ photoGap: +e.target.value })} className="w-full" />
              </Field>
              <div className="flex gap-4">
                <Toggle label="Enable Print" value={s.enablePrint} onChange={(v) => update({ enablePrint: v })} />
                <Toggle label="Enable QR" value={s.enableQR} onChange={(v) => update({ enableQR: v })} />
              </div>
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
