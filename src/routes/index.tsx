import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { Camera, Printer, QrCode, RefreshCw, Download, Settings as SettingsIcon, X } from "lucide-react";
import { RobotFace } from "@/components/RobotFace";
import { AdminPanel } from "@/components/AdminPanel";
import {
  getSettings, saveSettings, saveStrip, uid, logPrint, logDownload, type Settings,
} from "@/lib/booth-storage";
import { buildStrip, captureFromVideo } from "@/lib/strip";
import { uploadPhoto, storeStripData, uploadStripToApi } from "@/lib/server-storage";
import { speak, playShutterSound, stopSpeaking } from "@/lib/audio";
import { useSSEChannel } from "@/lib/sse-client";
import { sendPusherEvent } from "@/lib/pusher";
import { z } from "zod";

const searchSchema = z.object({
  channel: z.string().default("rovi-booth-default"),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
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
  const { channel } = Route.useSearch();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [photos, setPhotos] = useState<string[]>([]);
  const [strip, setStrip] = useState<{ id: string; dataUrl: string } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => getSettings());

  const { bus: channelBus } = useSSEChannel(channel);
  // Keep pusherChannelRef pointing at the ChannelBus so CameraScreen's
  // WebRTC bind/unbind calls work without modification.
  const pusherChannelRef = useRef<any>(null);
  pusherChannelRef.current = channelBus;

  const printTriggerRef = useRef<(() => void) | null>(null);
  const [tabletQr, setTabletQr] = useState<string>("");
  const [cameraState, setCameraState] = useState<{ count: number | null; shotIdx: number; flash: boolean }>({
    count: null,
    shotIdx: 0,
    flash: false,
  });

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

  // ── Persist kiosk state to /api/session so tablet can poll it ───────────────
  // This is the reliable fallback when SSE events are lost (Vercel Serverless
  // cold-start isolation). The tablet polls /api/session every second.
  const postSessionState = (screen: Screen, stripId: string | null) => {
    fetch(`/api/session?channel=${encodeURIComponent(channel)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen, stripId }),
    }).catch(() => {});
  };

  // Generate tablet QR code
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/tablet?channel=${channel}`;
      QRCode.toDataURL(url, { width: 256, margin: 2 })
        .then(setTabletQr)
        .catch(console.error);
    }
  }, [channel]);

  // Background camera stream pre-warmer: keeps camera stream 100% active & warm
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stream: MediaStream | null = null;

    // Stop any stale active stream tracks if settings.cameraId changed
    if ((window as any).__roviCameraStream) {
      try {
        const oldStream: MediaStream = (window as any).__roviCameraStream;
        oldStream.getTracks().forEach((t) => t.stop());
      } catch {}
      delete (window as any).__roviCameraStream;
    }

    const initCamera = async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          console.warn("[Camera Pre-warm] Camera access unavailable (Insecure HTTP connection or missing mediaDevices API)");
          return;
        }
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };
        if (settings.cameraId) {
          videoConstraints.deviceId = { ideal: settings.cameraId };
        } else {
          videoConstraints.facingMode = "user";
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        } catch (constraintErr) {
          console.warn("[Camera Pre-warm] Ideal constraints failed, falling back to default video:", constraintErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        (window as any).__roviCameraStream = stream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const s = track.getSettings();
          console.log(`[Camera Pre-warm] Live: ${s.width}×${s.height}@${s.frameRate}fps`);
        }
      } catch (e) {
        console.warn("[Camera Pre-warm] Camera access skipped or denied:", e);
      }
    };
    initCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      delete (window as any).__roviCameraStream;
    };
  }, [settings.cameraId]);

  // Bind kiosk control events from the tablet remote over SSE
  useEffect(() => {
    const handleStart = () => start();
    const handlePrint = () => { if (printTriggerRef.current) printTriggerRef.current(); };
    const handleGoHome = () => {
      stopSpeaking();
      setPhotos([]);
      setStrip(null);
      setScreen("welcome");
      postSessionState("welcome", null);
    };
    const handleSettingsUpdate = (newSettings: Settings) => {
      if (newSettings) {
        saveSettings(newSettings);
        setSettings(newSettings);
      }
    };

    channelBus.bind("START_CAPTURE", handleStart);
    channelBus.bind("TRIGGER_PRINT", handlePrint);
    channelBus.bind("GO_HOME", handleGoHome);
    channelBus.bind("SETTINGS_UPDATE", handleSettingsUpdate);

    return () => {
      channelBus.unbind("START_CAPTURE", handleStart);
      channelBus.unbind("TRIGGER_PRINT", handlePrint);
      channelBus.unbind("GO_HOME", handleGoHome);
      channelBus.unbind("SETTINGS_UPDATE", handleSettingsUpdate);
    };
  }, [channelBus]);

  // Broadcast state change to the tablet remote over SSE
  // AND persist to /api/session for reliable polling-based fallback
  useEffect(() => {
    // Only send stripUrl if it's a lightweight cloud URL (Vercel Blob).
    // Large base64 strings are omitted from sendPusherEvent to keep HTTP POST payloads <200 bytes.
    // Tablet fetches the full image via getStripData(stripId) server function.
    const currentStripUrl = strip?.dataUrl && !strip.dataUrl.startsWith("data:")
      ? strip.dataUrl
      : null;

    sendPusherEvent({
      data: {
        channel,
        event: "STATE_CHANGE",
        data: { 
          screen,
          count: screen === "camera" ? cameraState.count : null,
          shotIdx: screen === "camera" ? cameraState.shotIdx : 0,
          flash: screen === "camera" ? cameraState.flash : false,
          eventName: settings.eventName,
          printLayout: settings.printLayout,
          theme: settings.theme,
          enablePrint: settings.enablePrint,
          enableQR: settings.enableQR,
          stripId: strip?.id || null,
          stripUrl: currentStripUrl,
          settings: settings,
        },
      },
    }).catch((err) => console.warn("Failed to broadcast state change:", err));

    // Also persist to session API for polling-based tablet sync
    postSessionState(screen, strip?.id || null);
  }, [screen, cameraState, channel, settings, strip]);

  const onCapturedAll = useCallback(async (imgs: string[]) => {
    setPhotos(imgs);
    setScreen("processing");

    const id = uid();
    const s = getSettings();

    // 1. Build the photo strip canvas (hard 5s timeout safety guard)
    let dataUrl: string;
    try {
      const buildPromise = buildStrip(imgs, s);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Strip build timeout")), 5000)
      );
      dataUrl = await Promise.race([buildPromise, timeoutPromise]);
    } catch (err) {
      console.error("[Strip] buildStrip failed — fallback to first capture:", err);
      dataUrl = imgs[0] ?? "";
    }

    // 2. Set state & transition laptop UI to preview IMMEDIATELY
    setStrip({ id, dataUrl });
    setScreen("preview");

    // 3. Save locally in browser localStorage (guarded against QuotaExceededError)
    saveStrip({ id, dataUrl, createdAt: Date.now(), eventName: s.eventName });

    // 4. Update /api/session so tablet knows the strip is ready
    postSessionState("preview", id);

    // 5. Background upload to Nitro API (/api/strip) — non-blocking
    uploadStripToApi(id, dataUrl).catch((err) =>
      console.warn("Background strip upload warning:", err)
    );

    // 6. Broadcast PHOTO_READY over P2P DataChannel if tablet is connected
    sendPusherEvent({
      data: {
        channel,
        event: "PHOTO_READY",
        data: { id, dataUrl },
      },
    }).catch(() => {});
  }, [channel]);


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

      {/* Top-Level Studio White Camera Flash Overlay */}
      {cameraState.flash && (
        <div className="fixed inset-0 bg-white z-[99999] pointer-events-none" />
      )}

      <AnimatePresence mode="wait">
        {screen === "welcome" && <Welcome key="w" onStart={start} settings={settings} />}
        {screen === "camera" && (
          <CameraScreen 
            key="c" 
            settings={settings} 
            onDone={onCapturedAll} 
            onCancel={() => { stopSpeaking(); setPhotos([]); setStrip(null); setScreen("welcome"); postSessionState("welcome", null); }} 
            onStateChange={setCameraState}
            pusherChannelRef={pusherChannelRef}
            channelName={channel}
          />
        )}
        {screen === "processing" && <Processing key="p" settings={settings} />}
        {screen === "preview" && strip && (
          <Preview 
            key="pv" 
            strip={strip} 
            settings={settings} 
            onRetake={() => { stopSpeaking(); start(); }} 
            onHome={() => { stopSpeaking(); setPhotos([]); setStrip(null); setScreen("welcome"); postSessionState("welcome", null); }} 
            printTriggerRef={printTriggerRef}
          />
        )}
      </AnimatePresence>

      <AdminPanel 
        open={adminOpen} 
        onClose={() => setAdminOpen(false)} 
        tabletQr={tabletQr}
        tabletUrl={typeof window !== "undefined" ? `${window.location.origin}/tablet?channel=${channel}` : ""}
        onSave={(newSettings) => {
          setSettings(newSettings);
          sendPusherEvent({
            data: {
              channel,
              event: "SETTINGS_UPDATE",
              data: newSettings,
            },
          }).catch(console.warn);
        }}
      />
    </div>
  );
}

/* -------------------- Welcome -------------------- */
function Welcome({ onStart, settings }: { onStart: () => void; settings: Settings }) {
  const [size, setSize] = useState(280);

  useEffect(() => {
    setSize(Math.min(320, window.innerWidth * 0.55));
    const handleResize = () => setSize(Math.min(320, window.innerWidth * 0.55));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <motion.button
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onStart}
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-8 px-6 text-center"
    >
      <div className="text-sm tracking-[0.4em] text-muted-foreground">{settings.eventName.toUpperCase()}</div>
      <RobotFace size={size} />
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

function getSoftwareCameraFilters(settings: Settings, caps: any) {
  // --- Brightness from exposure ---
  let brightness = 1;
  if (settings.manualExposure) {
    // Only simulate in software if camera doesn't support native controls
    if (!caps.exposureTime || !caps.iso) {
      brightness = (settings.exposureTime / 100) * (settings.iso / 400);
    }
  } else {
    if (!caps.exposureCompensation && settings.exposureCompensation !== 0) {
      brightness = 1 + settings.exposureCompensation * 0.2;
    }
  }
  brightness = Math.max(0.3, Math.min(3.0, brightness));

  // --- White Balance via pure CSS filters ---
  // Map color temperature (K) to a sepia + hue-rotate approximation
  // 5000K = neutral. Warmer = more orange. Cooler = more blue.
  let sepia = 0;
  let hueRotate = 0;
  let saturation = 1;

  if (settings.manualWhiteBalance && !caps.colorTemperature) {
    const T = settings.colorTemperature;
    const delta = T - 5000; // positive = warmer, negative = cooler

    if (delta > 0) {
      // Warmer: add sepia (orange) tint
      sepia = Math.min(0.45, (delta / 6000) * 0.45);
      hueRotate = Math.min(15, (delta / 6000) * 15); // slight orange shift
    } else {
      // Cooler: rotate hue toward blue
      hueRotate = Math.max(-30, (delta / 3000) * 30);
      saturation = 1 + Math.abs(delta / 6000) * 0.2;
    }
  }

  // Tint: green-magenta axis approximated via hue-rotate
  let tintHue = 0;
  if (settings.manualWhiteBalance) {
    tintHue = -(settings.tint / 50) * 12; // max ±12deg rotation
  }

  const filters: string[] = [`brightness(${brightness.toFixed(2)})` ];
  if (sepia > 0) filters.push(`sepia(${sepia.toFixed(3)})`);
  if (hueRotate !== 0 || tintHue !== 0) filters.push(`hue-rotate(${(hueRotate + tintHue).toFixed(1)}deg)`);
  if (saturation !== 1) filters.push(`saturate(${saturation.toFixed(2)})`);

  const cssFilter = filters.join(" ");

  return { cssFilter };
}

/* -------------------- Camera -------------------- */
function CameraScreen({
  settings, onDone, onCancel, onStateChange, pusherChannelRef, channelName,
}: {
  settings: Settings;
  onDone: (imgs: string[]) => void;
  onCancel: () => void;
  onStateChange: (state: { count: number | null; shotIdx: number; flash: boolean }) => void;
  pusherChannelRef: React.MutableRefObject<any>;
  channelName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [shotIdx, setShotIdx] = useState(0);
  const photosRef = useRef<string[]>([]);
  const [capabilities, setCapabilities] = useState<any>({});
  const { cssFilter } = getSoftwareCameraFilters(settings, capabilities);

  useEffect(() => {
    onStateChange({ count, shotIdx, flash });
  }, [count, shotIdx, flash]);

  // WebRTC: stream the laptop camera to the tablet in real-time
  useEffect(() => {
    if (!ready) return;
    const pCh = pusherChannelRef.current;
    let active = true;
    let lastSignalTs = 0;
    let signalPolling = true;

    const postSignal = (type: string, data: any) => {
      fetch(`/api/signal?channel=${encodeURIComponent(channelName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data }),
      }).catch(() => {});
      sendPusherEvent({
        data: { channel: channelName, event: type, data },
      }).catch(() => {});
    };

    // Core function: create RTCPeerConnection, add camera tracks, send SDP offer
    const initiateStream = async () => {
      if (!active) return;
      peerRef.current?.close();
      peerRef.current = null;
      pendingCandidatesRef.current = [];

      const stream = streamRef.current;
      if (!stream) return;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      });
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && active) {
          postSignal("ICE_HOST", { candidate: e.candidate.toJSON() });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!active) return;
        postSignal("SDP_OFFER", { sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } });
        console.log("[WebRTC] SDP offer sent to tablet via /api/signal & P2P");

        // Configure video sender for high-quality encoding after offer is created
        // This must be done after setLocalDescription but BEFORE the answer arrives
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind !== "video") continue;
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 2_500_000;  // 2.5 Mbps for sharp 720p
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].scaleResolutionDownBy = 1; // no downscaling
            await sender.setParameters(params);
            console.log("[WebRTC] Video sender encoding configured: 2.5Mbps@30fps");
          } catch (encErr) {
            // setParameters() is best-effort — some browsers reject it before negotiation
            console.warn("[WebRTC] Could not set sender parameters (will retry after answer):", encErr);
          }
        }
      } catch (err) {
        console.warn("WebRTC offer failed:", err);
      }
    };

    initiateStream();

    const handleViewerReady = () => {
      console.log("[WebRTC] VIEWER_READY received — re-initiating stream");
      initiateStream();
    };

    const handleSdpAnswer = async (msg: { sdp: { type: RTCSdpType; sdp: string } }) => {
      const pc = peerRef.current;
      if (!pc || pc.signalingState === "stable") return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidatesRef.current = [];
        console.log("[WebRTC] SDP answer set — connection should stream now");

        // Re-apply encoding params after answer is set (full negotiation complete)
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind !== "video") continue;
          try {
            const params = sender.getParameters();
            if (params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = 2_500_000;
              params.encodings[0].maxFramerate = 30;
              params.encodings[0].scaleResolutionDownBy = 1;
              await sender.setParameters(params);
            }
          } catch { /* best-effort */ }
        }
      } catch (err) {
        console.warn("Failed to set remote description on host:", err);
      }
    };

    const handleIceViewer = async (msg: { candidate: RTCIceCandidateInit }) => {
      const pc = peerRef.current;
      if (!pc) return;
      if (!pc.remoteDescription) {
        pendingCandidatesRef.current.push(msg.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (err) {
        console.warn("Failed to add viewer ICE on host:", err);
      }
    };

    if (pCh) {
      pCh.bind("VIEWER_READY", handleViewerReady);
      pCh.bind("SDP_ANSWER", handleSdpAnswer);
      pCh.bind("ICE_VIEWER", handleIceViewer);
    }

    // Sequential signal polling (300ms gap between requests) — prevents overlapping
    // concurrent fetches that can clog the network queue during ICE exchange.
    const runSignalPoll = async () => {
      while (active && signalPolling) {
        try {
          const res = await fetch(`/api/signal?channel=${encodeURIComponent(channelName)}&since=${lastSignalTs}`);
          if (!res.ok || !active) { await new Promise((r) => setTimeout(r, 300)); continue; }
          const json = await res.json();
          if (json.success && Array.isArray(json.signals)) {
            for (const item of json.signals) {
              if (item.ts > lastSignalTs) lastSignalTs = item.ts;
              if (item.type === "VIEWER_READY") handleViewerReady();
              if (item.type === "SDP_ANSWER") handleSdpAnswer(item.data);
              if (item.type === "ICE_VIEWER") handleIceViewer(item.data);
            }
          }
        } catch { /* ignore transient errors */ }
        await new Promise((r) => setTimeout(r, 300));
      }
    };
    runSignalPoll();

    return () => {
      active = false;
      signalPolling = false;
      if (pCh) {
        pCh.unbind("VIEWER_READY", handleViewerReady);
        pCh.unbind("SDP_ANSWER", handleSdpAnswer);
        pCh.unbind("ICE_VIEWER", handleIceViewer);
      }
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, [ready, channelName]);

  // Live camera frame relay — dual transport (PeerJS P2P + /api/frame POST)
  // Runs continuously at 150ms during camera mode to ensure tablet preview
  // is 100% live and active at all times, including during countdowns and picture clicking.
  useEffect(() => {
    if (!ready) return;

    // Create canvas ONCE and reuse across all frames
    const canvas = document.createElement("canvas");
    canvas.width = 640;  // 640×480: sharp on tablets, ~25KB JPEG @ 0.72 quality
    canvas.height = 480;
    const ctx = canvas.getContext("2d", { alpha: false });

    let active = true;
    let isPosting = false; // prevent HTTP request queueing

    const interval = setInterval(async () => {
      if (!videoRef.current || !ctx || videoRef.current.readyState < 2) return;
      if (isPosting) return;

      try {
        isPosting = true;
        ctx.save();
        ctx.translate(640, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        ctx.restore();

        // 0.72 quality at 640×480: crisp image details (~25KB)
        const frameData = canvas.toDataURL("image/jpeg", 0.72);

        // 1. P2P DataChannel — instant delivery (<1ms on LAN)
        sendPusherEvent({
          data: {
            channel: channelName,
            event: "CAMERA_FRAME",
            data: { frame: frameData },
          },
        }).catch(() => {});

        // 2. HTTP POST to /api/frame (persists for Vercel cross-lambda polling)
        await fetch(`/api/frame?channel=${encodeURIComponent(channelName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame: frameData }),
        });
      } catch (e) {
      } finally {
        isPosting = false;
      }
    }, 150);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [ready, channelName]);

  useEffect(() => {
    speak("Get ready for your photos!", settings.enableVoice !== false);
  }, [settings.enableVoice]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        if ((window as any).__roviCameraStream) {
          const preStream: MediaStream = (window as any).__roviCameraStream;
          const activeTrack = preStream.getVideoTracks()[0];
          if (activeTrack && activeTrack.readyState === "live") {
            stream = preStream;
          }
        }

        if (!stream) {
          if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            const isHttpInsecure = typeof window !== "undefined" && window.location.protocol === "http:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
            throw new Error(
              isHttpInsecure
                ? "Camera access requires HTTPS or http://localhost (Browsers block camera access on non-localhost HTTP connections)."
                : "Camera device or mediaDevices API is not supported on this browser."
            );
          }

          const videoConstraints: MediaTrackConstraints = {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };

          if (settings.cameraId) {
            videoConstraints.deviceId = { ideal: settings.cameraId };
          } else {
            videoConstraints.facingMode = "user";
          }

          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            });
          } catch (deviceErr) {
            console.warn("Camera constraint acquisition failed, trying simple video constraint:", deviceErr);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (fallbackErr: any) {
              throw deviceErr;
            }
          }
          (window as any).__roviCameraStream = stream;
        }

        if (cancelled) {
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        streamRef.current = stream;

        // Query capabilities and apply constraints
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as any;
            setCapabilities(caps);
            const advancedConstraints: any = {};

            // 1. Exposure Mode & manual values
            if (settings.manualExposure) {
              if (caps.exposureMode?.includes("manual")) {
                advancedConstraints.exposureMode = "manual";
              }
              if (settings.exposureTime && caps.exposureTime) {
                const { min, max } = caps.exposureTime;
                advancedConstraints.exposureTime = Math.max(min, Math.min(max, settings.exposureTime));
              }
              if (settings.iso && caps.iso) {
                const { min, max } = caps.iso;
                advancedConstraints.iso = Math.max(min, Math.min(max, settings.iso));
              }
            } else {
              if (caps.exposureMode?.includes("continuous")) {
                advancedConstraints.exposureMode = "continuous";
              }
              if (settings.exposureCompensation !== undefined && caps.exposureCompensation) {
                const { min, max } = caps.exposureCompensation;
                advancedConstraints.exposureCompensation = Math.max(min, Math.min(max, settings.exposureCompensation));
              }
            }

            // 2. White Balance Mode & colorTemperature
            if (settings.manualWhiteBalance) {
              if (caps.whiteBalanceMode?.includes("manual")) {
                advancedConstraints.whiteBalanceMode = "manual";
              }
              if (settings.colorTemperature && caps.colorTemperature) {
                const { min, max } = caps.colorTemperature;
                advancedConstraints.colorTemperature = Math.max(min, Math.min(max, settings.colorTemperature));
              }
            } else {
              if (caps.whiteBalanceMode?.includes("continuous")) {
                advancedConstraints.whiteBalanceMode = "continuous";
              }
            }

            // 3. Auto-Focus Mode & Sharpness Boost
            if (caps.focusMode?.includes("continuous")) {
              advancedConstraints.focusMode = "continuous";
            } else if (caps.focusMode?.includes("single-shot")) {
              advancedConstraints.focusMode = "single-shot";
            }
            if (caps.sharpness) {
              advancedConstraints.sharpness = caps.sharpness.max;
            }

            if (Object.keys(advancedConstraints).length > 0) {
              await track.applyConstraints({ advanced: [advancedConstraints] });
            }
          } catch (constraintErr) {
            console.warn("Failed to apply camera constraints:", constraintErr);
          }
        }

        // If video metadata is already loaded (from pre-warmed stream), proceed instantly without waiting
        if (video.readyState < 2) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener("loadedmetadata", onReady);
              resolve();
            };
            const timer = setTimeout(resolve, 500); // safety fallback timeout
            video.addEventListener("loadedmetadata", () => {
              clearTimeout(timer);
              onReady();
            });
          });
        }

        if (cancelled) return;

        video.muted = true;
        video.defaultMuted = true;
        try {
          await video.play();
        } catch (playErr: any) {
          if (playErr?.name === "AbortError") return;
        }

        if (!cancelled) {
          setReady(true);
          // Report actual camera resolution for diagnostics
          const liveTrack = stream?.getVideoTracks()[0];
          if (liveTrack) {
            const s = liveTrack.getSettings();
            console.log(`[CameraScreen] Live: ${s.width}×${s.height}@${s.frameRate}fps`);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          let msg = e?.message || "Camera access denied or unavailable";
          if (e?.name === "NotReadableError" || e?.name === "TrackStartError") {
            msg = "Camera is in use by another application (e.g. Zoom, Teams, Windows Camera App, or OBS). Please close other apps using the camera and try again.";
          } else if (e?.name === "OverconstrainedError" || e?.name === "NotFoundError") {
            msg = "Selected camera device not found. Please open Admin Settings (Shift+A) to choose an active camera.";
          } else if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
            msg = "Camera permission was denied in your browser settings. Please click the camera icon in your browser address bar to allow access.";
          }
          setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stream && stream !== (window as any).__roviCameraStream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
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
      await wait(600); // brief "Get Ready" moment
      const numShots = settings.printLayout === "4x6" ? 4 : 3;
      for (let i = 0; i < numShots; i++) {
        if (cancelled) return;
        setShotIdx(i);

        await runCountdown(i === 0 ? settings.countdownTime : settings.photoGap);
        if (cancelled || !videoRef.current) return;

        // 1. Activate flash screen overlay
        setFlash(true);

        // 2. Notify tablet to flash simultaneously
        sendPusherEvent({
          data: {
            channel: channelName,
            event: "STATE_CHANGE",
            data: { screen: "camera", count: 0, shotIdx: i, flash: true },
          },
        }).catch(() => {});

        // 3. Wait 120ms for flash overlay settling
        await wait(120);
        if (cancelled || !videoRef.current) return;

        // 4. Capture photo from video element
        const img = await captureFromVideo(videoRef.current, cssFilter);
        photosRef.current.push(img);
        playShutterSound();

        // 5. Turn off flash quickly
        await wait(60);
        setFlash(false);

        await wait(200);
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
        <div className="text-sm tracking-widest text-muted-foreground">PHOTO {shotIdx + 1} / {settings.printLayout === "4x6" ? 4 : 3}</div>
        <button onClick={onCancel} className="p-2 rounded-full bg-card/60 border border-border"><X /></button>
      </div>

      <div className="flex-1 relative flex items-center justify-center px-4">
        <div className="relative w-full max-w-3xl aspect-[4/3] rounded-3xl overflow-hidden neon-border bg-black">
          <video
            ref={videoRef}
            playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: `scaleX(-1) scale(${settings.photoZoom || 1.0})`, filter: cssFilter }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tracking-wider text-accent uppercase">
              Get Ready!
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
          {flash && <div className="fixed inset-0 bg-white z-[99999] pointer-events-none" />}
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
          {Array.from({ length: settings.printLayout === "4x6" ? 4 : 3 }).map((_, i) => (
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
function Processing({ settings }: { settings: Settings }) {
  useEffect(() => {
    speak("Creating your photo strip, please wait...", settings.enableVoice !== false);
  }, [settings.enableVoice]);

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
  strip, settings, onRetake, onHome, printTriggerRef,
}: {
  strip: { id: string; dataUrl: string };
  settings: Settings;
  onRetake: () => void;
  onHome: () => void;
  printTriggerRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    speak("Looking great! If you want to print your photos, please click on the print button below.", settings.enableVoice !== false);
  }, [settings.enableVoice]);

  // 60-second inactivity watchdog on Preview: auto-returns to Welcome screen if guest leaves
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("[Preview] Inactivity timeout (60s) — returning to Welcome screen");
      onHome();
    }, 60000);
    return () => clearTimeout(timer);
  }, [onHome]);

  useEffect(() => {
    printTriggerRef.current = handlePrint;
    return () => {
      printTriggerRef.current = null;
    };
  }, [strip, settings]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = strip.dataUrl;
    a.download = `rovi-photo-${strip.id}.jpg`;
    a.click();
    logDownload(strip.id);
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    speak("Thank you! Printing your photo strip now.", settings.enableVoice !== false);

    let printDataUrl = strip.dataUrl;

    if (settings.printLayout !== "4x6") {
      // 1. Create a temporary image to load the single strip base64 content
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = resolve;
      });
      img.src = strip.dataUrl;
      await loadPromise;

      // 2. Create a 6x4 inch canvas at 300 DPI (1800x1200 px) for landscape printing
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d")!;

      // 3. Fill canvas background with solid white
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1800, 1200);

      // 4. Draw first copy (top half) rotated 90 degrees counter-clockwise
      ctx.save();
      ctx.translate(0, 600);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, img.width, img.height);
      ctx.restore();

      // 5. Draw second copy (bottom half) rotated 90 degrees counter-clockwise
      ctx.save();
      ctx.translate(0, 1200);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, img.width, img.height);
      ctx.restore();

      // 6. Draw dashed cut line in the middle (y = 600 px)
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = "rgba(180, 180, 180, 0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 600);
      ctx.lineTo(1800, 600);
      ctx.stroke();

      printDataUrl = canvas.toDataURL("image/jpeg", 0.94);
    }

    // Direct background printing via hidden iframe — no popups or extra window interface!
    const existing = document.getElementById("rovi-direct-print-frame");
    if (existing) {
      try { existing.remove(); } catch {}
    }

    const iframe = document.createElement("iframe");
    iframe.id = "rovi-direct-print-frame";
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><title>ROVI Photo Print</title>
<style>
  @page { margin: 0; size: auto; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    background: #ffffff;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  img {
    display: block;
    width: 100vw;
    height: 100vh;
    object-fit: fill;
    page-break-after: avoid;
    break-after: avoid;
  }
</style></head>
<body>
  <img id="p" src="${printDataUrl}" />
  <script>
    document.getElementById('p').onload = function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch(e) {}
      }, 200);
    };
  </script>
</body></html>`);
      doc.close();

      setTimeout(() => {
        try { iframe.remove(); } catch {}
      }, 60000);
    }
    logPrint(strip.id);

    // Auto-return to Welcome screen 4 seconds after printing so the booth resets for the next guest
    setTimeout(() => {
      onHome();
    }, 4000);
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
          className="h-[60vh] lg:h-[85vh] max-w-full w-auto rounded-xl shadow-2xl neon-border bg-white"
        />
      </motion.div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <div className="text-center mb-2">
          <div className="text-3xl font-black neon-text">Looking Great!</div>
          <div className="text-muted-foreground text-sm">{settings.eventName}</div>
        </div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className={`p-3 rounded-2xl text-xs leading-normal border text-center font-medium shadow-md ${
            settings.theme === "floral"
              ? "bg-[#ffeff4] border-[#ffc2d6] text-[#b03b60]"
              : "bg-primary/10 border-primary/20 text-primary"
          }`}
        >
          📢 <strong>Hint:</strong> If you want to print your photos, please click on the <strong>Print Photo</strong> button below!
        </motion.div>

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
