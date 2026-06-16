import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { Camera, Printer, QrCode, RefreshCw, Download, Settings as SettingsIcon, X } from "lucide-react";
import { RobotFace } from "@/components/RobotFace";
import { AdminPanel } from "@/components/AdminPanel";
import {
  getSettings, saveStrip, uid, logPrint, logDownload, type Settings,
} from "@/lib/booth-storage";
import { buildStrip, captureFromVideo } from "@/lib/strip";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ROVI AI Photo Booth Kiosk" },
      { name: "description", content: "Touch-screen AI photo booth kiosk for events — capture, print, and share photo strips instantly." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
    ],
  }),
  component: Kiosk,
});

type Screen = "welcome" | "camera" | "processing" | "preview";

function Kiosk() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [photos, setPhotos] = useState<string[]>([]);
  const [strip, setStrip] = useState<{ id: string; dataUrl: string } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => getSettings());

  // Refresh settings whenever we leave admin
  useEffect(() => { if (!adminOpen) setSettings(getSettings()); }, [adminOpen]);

  // Hidden admin: triple-tap top-left corner OR press 'A'
  const tapsRef = useRef<number[]>([]);
  const onCornerTap = () => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < 1200), now];
    if (tapsRef.current.length >= 3) {
      tapsRef.current = [];
      setAdminOpen(true);
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "a" && e.shiftKey) setAdminOpen(true); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const start = () => { setPhotos([]); setStrip(null); setScreen("camera"); };
  const onCapturedAll = useCallback(async (imgs: string[]) => {
    setPhotos(imgs);
    setScreen("processing");
    const dataUrl = await buildStrip(imgs, getSettings());
    const id = uid();
    const s = getSettings();
    saveStrip({ id, dataUrl, createdAt: Date.now(), eventName: s.eventName });
    setStrip({ id, dataUrl });
    setScreen("preview");
  }, []);

  return (
    <div className="fixed inset-0 grid-bg overflow-hidden select-none">
      {/* hidden admin hotspot */}
      <button
        aria-label="admin"
        onClick={onCornerTap}
        className="absolute top-0 left-0 w-16 h-16 z-40 opacity-0"
      />
      <button
        aria-label="admin-visible"
        onClick={() => setAdminOpen(true)}
        className="absolute top-3 right-3 z-40 p-3 rounded-full bg-card/60 backdrop-blur border border-border opacity-30 hover:opacity-100 transition"
      >
        <SettingsIcon className="w-5 h-5" />
      </button>

      <AnimatePresence mode="wait">
        {screen === "welcome" && <Welcome key="w" onStart={start} settings={settings} />}
        {screen === "camera" && <CameraScreen key="c" settings={settings} onDone={onCapturedAll} onCancel={() => setScreen("welcome")} />}
        {screen === "processing" && <Processing key="p" />}
        {screen === "preview" && strip && (
          <Preview key="pv" strip={strip} settings={settings} onRetake={start} onHome={() => setScreen("welcome")} />
        )}
      </AnimatePresence>

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}

/* -------------------- Welcome -------------------- */
function Welcome({ onStart, settings }: { onStart: () => void; settings: Settings }) {
  return (
    <motion.button
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onStart}
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-8 px-6 text-center"
    >
      <div className="text-sm tracking-[0.4em] text-muted-foreground">{settings.eventName.toUpperCase()}</div>
      <RobotFace size={Math.min(320, typeof window !== "undefined" ? window.innerWidth * 0.55 : 280)} />
      <motion.h1
        className="text-5xl sm:text-7xl md:text-8xl font-black neon-text"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        TOUCH TO START
      </motion.h1>
      <div className="text-muted-foreground text-lg">Powered by ROVI AI Photo Booth</div>
    </motion.button>
  );
}

/* -------------------- Camera -------------------- */
function CameraScreen({
  settings, onDone, onCancel,
}: { settings: Settings; onDone: (imgs: string[]) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [shotIdx, setShotIdx] = useState(0);
  const photosRef = useRef<string[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e: any) {
        setError(e?.message || "Camera permission denied");
      }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // capture sequence
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const runCountdown = (from: number) =>
      new Promise<void>((resolve) => {
        let n = from;
        setCount(n);
        const id = setInterval(() => {
          if (cancelled) { clearInterval(id); resolve(); return; }
          n -= 1;
          if (n <= 0) { clearInterval(id); setCount(null); resolve(); }
          else setCount(n);
        }, 1000);
      });

    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      await wait(1200); // "Get Ready"
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        setShotIdx(i);
        await runCountdown(i === 0 ? settings.countdownTime : settings.photoGap);
        if (cancelled || !videoRef.current) return;
        const img = captureFromVideo(videoRef.current);
        photosRef.current.push(img);
        setFlash(true);
        setTimeout(() => setFlash(false), 220);
        await wait(600);
      }
      if (!cancelled) onDone(photosRef.current);
    })();

    return () => { cancelled = true; };
  }, [ready, settings.countdownTime, settings.photoGap, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col"
    >
      <div className="flex items-center justify-between p-4">
        <div className="text-sm tracking-widest text-muted-foreground">PHOTO {shotIdx + 1} / 3</div>
        <button onClick={onCancel} className="p-2 rounded-full bg-card/60 border border-border"><X /></button>
      </div>

      <div className="flex-1 relative flex items-center justify-center px-4">
        <div className="relative w-full max-w-3xl aspect-[4/3] rounded-3xl overflow-hidden neon-border bg-black">
          <video
            ref={videoRef}
            playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              Requesting camera…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-3">
              <Camera className="w-12 h-12 text-destructive" />
              <div className="text-destructive font-bold">Camera unavailable</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <button onClick={onCancel} className="mt-3 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold">Back</button>
            </div>
          )}
          <AnimatePresence>
            {count !== null && (
              <motion.div
                key={count}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="text-[14rem] sm:text-[18rem] font-black neon-text leading-none">{count}</div>
              </motion.div>
            )}
          </AnimatePresence>
          {flash && <div className="absolute inset-0 bg-white animate-pulse" />}
        </div>
      </div>

      <div className="text-center pb-8 px-4">
        <motion.div
          className="text-3xl sm:text-5xl font-black neon-text"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          {count === null ? "Get Ready" : "Smile!"}
        </motion.div>
        <div className="mt-2 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i}
              className={`h-2 w-10 rounded-full transition ${
                i < photosRef.current.length ? "bg-primary" : i === shotIdx ? "bg-accent" : "bg-secondary"
              }`} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------- Processing -------------------- */
function Processing() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center"
    >
      <RobotFace size={220} />
      <h2 className="text-4xl sm:text-6xl font-black neon-text">Creating Photo Strip</h2>
      <div className="w-72 max-w-full h-3 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full"
          style={{ background: "linear-gradient(90deg, var(--neon), var(--neon-2))" }}
          initial={{ width: "5%" }} animate={{ width: ["5%", "85%", "100%"] }}
          transition={{ duration: 1.6, times: [0, 0.8, 1] }}
        />
      </div>
      <div className="text-muted-foreground">AI is composing your memory…</div>
    </motion.div>
  );
}

/* -------------------- Preview -------------------- */
function Preview({
  strip, settings, onRetake, onHome,
}: {
  strip: { id: string; dataUrl: string };
  settings: Settings;
  onRetake: () => void;
  onHome: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = strip.dataUrl;
    a.download = `rovi-photo-${strip.id}.jpg`;
    a.click();
    logDownload(strip.id);
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "noopener,noreferrer,width=400,height=900");
    if (!w) { window.print(); return; }
    w.document.write(`
      <html><head><title>Print</title>
      <style>
        @page { size: 2in 6in; margin: 0; }
        html,body { margin:0; padding:0; background:#fff; }
        img { width: 2in; height: 6in; display:block; }
      </style></head><body>
      <img src="${strip.dataUrl}" onload="setTimeout(()=>{window.focus();window.print();}, 100)" />
      </body></html>
    `);
    w.document.close();
    logPrint(strip.id);
  };

  const handleQR = async () => {
    const url = `${window.location.origin}/photo/${strip.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    setQr(dataUrl);
    setShowQR(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center gap-6 p-4 sm:p-8 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.7, rotate: -4 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
        className="shrink-0"
      >
        <img
          src={strip.dataUrl}
          alt="Photo strip"
          className="h-[60vh] lg:h-[85vh] w-auto rounded-xl shadow-2xl neon-border bg-white"
        />
      </motion.div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <div className="text-center mb-2">
          <div className="text-3xl font-black neon-text">Looking Great!</div>
          <div className="text-muted-foreground text-sm">{settings.eventName}</div>
        </div>
        <BigBtn onClick={onRetake} icon={<RefreshCw />} label="Retake Photos" tone="secondary" />
        {settings.enablePrint && <BigBtn onClick={handlePrint} icon={<Printer />} label="Print Photo" tone="primary" />}
        <BigBtn onClick={handleDownload} icon={<Download />} label="Download" tone="secondary" />
        {settings.enableQR && <BigBtn onClick={handleQR} icon={<QrCode />} label="Generate QR Code" tone="accent" />}
        <button onClick={onHome} className="mt-2 text-muted-foreground hover:text-foreground py-2">← Back to start</button>
      </div>

      <AnimatePresence>
        {showQR && qr && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-6"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card neon-border rounded-2xl p-8 max-w-sm w-full text-center"
            >
              <h3 className="text-3xl font-black neon-text mb-2">Scan To Download</h3>
              <p className="text-muted-foreground text-sm mb-4">Open camera on your phone and scan</p>
              <img src={qr} alt="QR" className="w-full rounded-xl bg-white p-3" />
              <button onClick={() => setShowQR(false)} className="mt-5 w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold">
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BigBtn({
  onClick, icon, label, tone,
}: { onClick: () => void; icon: React.ReactNode; label: string; tone: "primary" | "secondary" | "accent" }) {
  const styles =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "accent"
        ? "bg-accent text-accent-foreground"
        : "bg-secondary text-secondary-foreground border border-border";
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={`flex items-center justify-center gap-3 rounded-2xl py-5 px-5 text-xl font-bold shadow-lg ${styles}`}
    >
      {icon}<span>{label}</span>
    </motion.button>
  );
}
