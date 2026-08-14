import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Pusher from "pusher-js";
import { sendPusherEvent } from "@/lib/pusher";
import { getStripData } from "@/lib/server-storage";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, RefreshCw, Download, QrCode, WifiOff, AlertTriangle } from "lucide-react";
import { RobotFace } from "@/components/RobotFace";
import QRCode from "qrcode";

const searchSchema = z.object({
  channel: z.string().default("rovi-booth-default"),
});

export const Route = createFileRoute("/tablet")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "ROVI Photo Booth — Tablet Remote" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
    ],
  }),
  component: TabletRemote,
});

type TabletState = "welcome" | "camera" | "processing" | "preview";

function TabletRemote() {
  const { channel } = Route.useSearch();
  const [state, setState] = useState<TabletState>("welcome");
  const [stripUrl, setStripUrl] = useState<string | null>(null);

  // Real-time mirrored camera states
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [shotIdx, setShotIdx] = useState(0);
  const [eventName, setEventName] = useState("ROVI Live Event");
  const [printLayout, setPrintLayout] = useState("2x6");
  const [enablePrint, setEnablePrint] = useState(true);
  const [enableQR, setEnableQR] = useState(true);

  // QR code for downloading
  const [qr, setQr] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [connected, setConnected] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [hasWebRtcVideo, setHasWebRtcVideo] = useState(false);
  const [currentStripId, setCurrentStripId] = useState<string | null>(null);

  const pusherRef = useRef<Pusher | null>(null);
  const pusherChannelRef = useRef<any>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const tabletPeerRef = useRef<RTCPeerConnection | null>(null);
  const pendingHostCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY;
  const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;

  const numShots = printLayout === "4x6" ? 4 : 3;

  const loadStripForTablet = async (id?: string | null, url?: string | null) => {
    if (id) setCurrentStripId(id);

    // 1. If a URL was provided (cloud or LAN), use it directly to load the image
    //    This is the primary path: laptop sends http://192.168.x.x:3001/photos/<id>.jpg
    if (url && url.startsWith("http") && url.length > 10) {
      setStripUrl(url);
      return;
    }

    // 2. Fallback: fetch base64 via server function
    //    Works when: in-memory store has data (storeStripData ran) OR file is on disk
    if (id) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const res = await getStripData({ data: id });
          if (res && res.success && res.dataUrl) {
            setStripUrl(res.dataUrl);
            return;
          }
        } catch (err) {
          console.warn(`[Tablet] getStripData attempt ${attempt + 1} failed:`, err);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      console.error("[Tablet] Failed to load strip after 10 attempts for id:", id);
    }
  };

  useEffect(() => {
    if (!PUSHER_KEY || !PUSHER_CLUSTER) {
      console.error("Pusher credentials are not configured in .env");
      setConfigError(true);
      return;
    }

    if (process.env.NODE_ENV === "development") {
      Pusher.logToConsole = true;
    }

    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
    pusherRef.current = pusher;

    const pusherChannel = pusher.subscribe(channel);
    pusherChannelRef.current = pusherChannel;

    pusher.connection.bind("state_change", (states: { current: string }) => {
      setConnected(states.current === "connected");
    });

    setConnected(pusher.connection.state === "connected");

    pusherChannel.bind("STATE_CHANGE", (msg: {
      screen: TabletState;
      count: number | null;
      shotIdx: number;
      flash: boolean;
      eventName?: string;
      printLayout?: string;
      enablePrint?: boolean;
      enableQR?: boolean;
      stripId?: string;
      stripUrl?: string;
    }) => {
      setState(msg.screen);
      setCount(msg.count);
      setShotIdx(msg.shotIdx);
      setFlash(msg.flash);
      if (msg.eventName) setEventName(msg.eventName);
      if (msg.printLayout) setPrintLayout(msg.printLayout);
      if (msg.enablePrint !== undefined) setEnablePrint(msg.enablePrint);
      if (msg.enableQR !== undefined) setEnableQR(msg.enableQR);
      if (msg.stripId) setCurrentStripId(msg.stripId);

      if (msg.screen === "preview" && (msg.stripId || msg.stripUrl)) {
        loadStripForTablet(msg.stripId, msg.stripUrl);
      }
    });

    pusherChannel.bind("PHOTO_READY", async (msg: { id?: string; dataUrl: string }) => {
      setState("preview");
      if (msg.id) setCurrentStripId(msg.id);
      await loadStripForTablet(msg.id, msg.dataUrl);
    });

    pusherChannel.bind("CAMERA_FRAME", (msg: { frame: string }) => {
      if (msg.frame) {
        setSnapshotUrl(msg.frame);
      }
    });

    pusherChannel.bind("RESET", () => {
      setState("welcome");
      setStripUrl(null);
      setCurrentStripId(null);
      setQr(null);
      setShowQR(false);
      setSnapshotUrl(null);
      setHasWebRtcVideo(false);
    });

    return () => {
      pusherChannel.unbind_all();
      pusher.unsubscribe(channel);
      pusher.disconnect();
      pusherChannelRef.current = null;
    };
  }, [channel, PUSHER_KEY, PUSHER_CLUSTER]);

  const triggerEvent = async (event: string, payload = {}) => {
    try {
      await sendPusherEvent({
        data: {
          channel,
          event,
          data: payload,
        },
      });
    } catch (err) {
      console.error(`Failed to trigger remote event ${event}:`, err);
    }
  };

  // WebRTC: receive live camera stream from the laptop
  useEffect(() => {
    if (state !== "camera") {
      tabletPeerRef.current?.close();
      tabletPeerRef.current = null;
      pendingHostCandidatesRef.current = [];
      setHasWebRtcVideo(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      return;
    }

    const pCh = pusherChannelRef.current;
    if (!pCh || !connected) return; // wait until Pusher is connected

    // Tell the laptop we're ready to receive the video stream
    console.log("[WebRTC] Sending VIEWER_READY to laptop");
    sendPusherEvent({ data: { channel, event: "VIEWER_READY", data: {} } }).catch(console.warn);

    const handleSdpOffer = async (msg: { sdp: { type: RTCSdpType; sdp: string } }) => {
      console.log("[WebRTC] SDP offer received — creating answer");
      tabletPeerRef.current?.close();

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      tabletPeerRef.current = pc;

      pc.onconnectionstatechange = () => {
        console.log("[WebRTC] Tablet peer state:", pc.connectionState);
      };

      pc.ontrack = (e) => {
        console.log("[WebRTC] Track received on tablet — attaching to video");
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.play().then(() => {
            setHasWebRtcVideo(true);
          }).catch((err) => {
            console.warn("[WebRTC] Video play error on tablet:", err);
          });
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendPusherEvent({
            data: { channel, event: "ICE_VIEWER", data: { candidate: e.candidate.toJSON() } },
          }).catch(console.warn);
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        for (const c of pendingHostCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingHostCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("[WebRTC] SDP answer sent to laptop");
        await sendPusherEvent({
          data: {
            channel,
            event: "SDP_ANSWER",
            data: { sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } },
          },
        });
      } catch (err) {
        console.warn("WebRTC answer failed on tablet:", err);
      }
    };

    const handleIceHost = async (msg: { candidate: RTCIceCandidateInit }) => {
      const pc = tabletPeerRef.current;
      if (!pc) return;
      if (!pc.remoteDescription) {
        pendingHostCandidatesRef.current.push(msg.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (err) {
        console.warn("Failed to add host ICE on tablet:", err);
      }
    };

    pCh.bind("SDP_OFFER", handleSdpOffer);
    pCh.bind("ICE_HOST", handleIceHost);

    return () => {
      pCh.unbind("SDP_OFFER", handleSdpOffer);
      pCh.unbind("ICE_HOST", handleIceHost);
      tabletPeerRef.current?.close();
      tabletPeerRef.current = null;
      pendingHostCandidatesRef.current = [];
      setHasWebRtcVideo(false);
    };
  }, [state, channel, connected]);

  const handleStart = () => {
    triggerEvent("START_CAPTURE");
    setState("camera");
  };

  // Helper: convert an http/https URL to a base64 data URL by fetching as blob
  const toDataUrl = async (src: string): Promise<string> => {
    if (src.startsWith("data:")) return src;
    const resp = await fetch(src);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ── PRINT: exact same logic as the laptop's handlePrint ────────────────────
  const handlePrint = async () => {
    triggerEvent("TRIGGER_PRINT", { id: currentStripId });
    if (!stripUrl) return;

    // Always convert to base64 first to avoid CORS tainted canvas errors
    let dataUrl: string;
    try {
      dataUrl = await toDataUrl(stripUrl);
    } catch (err) {
      console.error("[Tablet] Failed to fetch strip for print:", err);
      return;
    }

    let printDataUrl = dataUrl;

    if (printLayout !== "4x6") {
      // Create a 6x4 inch canvas at 300 DPI (1800x1200 px) for landscape printing
      const img = new Image();
      const loadPromise = new Promise<void>((resolve) => { img.onload = () => resolve(); });
      img.src = dataUrl;
      await loadPromise;

      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d")!;

      // Fill background with white
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1800, 1200);

      // First copy (top half) — rotated 90° counter-clockwise
      ctx.save();
      ctx.translate(0, 600);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, img.width, img.height);
      ctx.restore();

      // Second copy (bottom half) — rotated 90° counter-clockwise
      ctx.save();
      ctx.translate(0, 1200);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, img.width, img.height);
      ctx.restore();

      // Dashed cut line in the middle
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = "rgba(180, 180, 180, 0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 600);
      ctx.lineTo(1800, 600);
      ctx.stroke();

      printDataUrl = canvas.toDataURL("image/jpeg", 0.94);
    }

    // Modern, popup-blocker safe printing for mobile / iPad Safari
    let printArea = document.getElementById("rovi-tablet-print-area");
    if (!printArea) {
      printArea = document.createElement("div");
      printArea.id = "rovi-tablet-print-area";
      document.body.appendChild(printArea);
    }
    printArea.innerHTML = `<img src="${printDataUrl}" style="width:100%;height:100%;object-fit:contain;" />`;

    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleRetake = () => {
    triggerEvent("START_CAPTURE");

    setState("camera");
    setStripUrl(null);
    setQr(null);
    setShowQR(false);
  };

  const handleGoHome = () => {
    triggerEvent("GO_HOME");
    setState("welcome");
    setStripUrl(null);
    setQr(null);
    setShowQR(false);
  };

  const handleDownload = async () => {
    if (!stripUrl) return;

    try {
      // Always fetch as blob — works for both data: URLs and http:// LAN/cloud URLs
      const blob = await (await fetch(stripUrl)).blob();
      const file = new File([blob], `rovi-photo-${currentStripId || "strip"}.jpg`, { type: "image/jpeg" });

      // Mobile Web Share API — best on iOS Safari & Android Chrome
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: "My ROVI Photo Strip",
            files: [file],
          });
          return;
        } catch (e) {
          console.warn("Share cancelled or unsupported:", e);
        }
      }

      // Fallback: create object URL and trigger anchor download
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `rovi-photo-${currentStripId || "strip"}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (err) {
      console.error("[Tablet] Download failed:", err);
      // Last resort: open in new tab
      window.open(stripUrl, "_blank");
    }
  };

  const handleQR = async () => {
    if (!stripUrl) return;
    const qrUrl = currentStripId
      ? `${window.location.origin}/photo/${currentStripId}`
      : (stripUrl.startsWith("data:") ? window.location.origin : stripUrl);

    const dataUrl = await QRCode.toDataURL(qrUrl, { width: 512, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    setQr(dataUrl);
    setShowQR(true);
  };

  if (configError) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="bg-destructive/15 border border-destructive/30 p-6 rounded-2xl max-w-md">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Pusher Keys Missing</h2>
          <p className="text-muted-foreground text-sm mb-4">
            You need to create a free account at Pusher and add your credentials to the <code>.env</code> file in your project.
          </p>
          <div className="text-left text-xs bg-black/40 p-3 rounded-lg border border-white/5 space-y-1 font-mono text-muted-foreground">
            <div>VITE_PUSHER_KEY="your_key"</div>
            <div>VITE_PUSHER_CLUSTER="your_cluster"</div>
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center text-white p-6 text-center">
        <WifiOff className="w-12 h-12 text-muted-foreground animate-bounce mb-4" />
        <h2 className="text-xl font-bold mb-1">Connecting to Booth...</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Waiting for Pusher connection. Make sure your device has internet access.
        </p>
        <div className="text-xs text-muted-foreground/40 mt-6 font-mono">Channel: {channel}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 grid-bg overflow-hidden select-none">
      <style>{`
        @media print {
          body > *:not(#rovi-tablet-print-area) {
            display: none !important;
          }
          #rovi-tablet-print-area {
            display: block !important;
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            background: white;
            z-index: 99999;
          }
        }
      `}</style>
      {/* Small channel tag */}
      <div className="absolute top-4 left-4 text-xs font-mono text-muted-foreground/30 z-10">
        CH: {channel}
      </div>

      <AnimatePresence mode="wait">

        {/* ── WELCOME ── mirrors laptop Welcome screen exactly */}
        {state === "welcome" && (
          <motion.button
            key="w"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleStart}
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-8 px-6 text-center focus:outline-none"
          >
            <div className="text-sm tracking-[0.4em] text-muted-foreground">{eventName.toUpperCase()}</div>
            <RobotFace size={240} />
            <motion.h1
              className="text-5xl sm:text-7xl md:text-8xl font-black neon-text"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              TOUCH TO START
            </motion.h1>
            <div className="text-muted-foreground text-lg">Powered by ROVI AI Photo Booth</div>
          </motion.button>
        )}

        {/* ── CAMERA ── mirrors laptop CameraScreen layout */}
        {state === "camera" && (
          <motion.div
            key="c"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4">
              <div className="text-sm tracking-widest text-muted-foreground">PHOTO {shotIdx + 1} / {numShots}</div>
              <button
                onClick={handleGoHome}
                className="p-2 rounded-full bg-card/60 border border-border text-sm px-4"
              >
                Cancel
              </button>
            </div>

            {/* Camera view area — live WebRTC stream from laptop */}
            <div className="flex-1 relative flex items-center justify-center px-4">
              <div className="relative w-full max-w-3xl aspect-[4/3] rounded-3xl overflow-hidden neon-border bg-black">

                {/* Live camera stream from laptop via WebRTC */}
                <video
                  ref={(el) => { remoteVideoRef.current = el; }}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-300 ${hasWebRtcVideo ? "opacity-100" : "opacity-0"}`}
                  style={{ transform: "scaleX(-1)" }}
                />

                {/* Fallback live snapshot stream if WebRTC is unavailable */}
                {snapshotUrl && !hasWebRtcVideo && (
                  <img
                    src={snapshotUrl}
                    alt="Live camera feed"
                    className="absolute inset-0 w-full h-full object-cover z-5"
                  />
                )}

                {/* Fallback shown behind video until stream connects */}
                {!snapshotUrl && !hasWebRtcVideo && (
                  <>
                    <div className="absolute inset-0 grid-bg opacity-40" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground z-0">
                      <motion.div
                        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-7xl"
                      >
                        📷
                      </motion.div>
                      <p className="text-sm font-medium">Connecting to camera…</p>
                    </div>
                  </>
                )}

                {/* Mirrored countdown overlay */}
                <AnimatePresence>
                  {count !== null && (
                    <motion.div
                      key={count}
                      initial={{ scale: 2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 z-20"
                    >
                      <div className="text-[14rem] sm:text-[18rem] font-black neon-text leading-none">{count}</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* White flash mirroring */}
                {flash && <div className="absolute inset-0 bg-white z-30" />}
              </div>
            </div>

            {/* Bottom status — mirrors laptop bottom bar */}
            <div className="text-center pb-8 px-4">
              <motion.div
                className="text-3xl sm:text-5xl font-black neon-text"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                {count === null ? "Get Ready" : "Smile!"}
              </motion.div>
              <div className="mt-2 flex justify-center gap-2">
                {Array.from({ length: numShots }).map((_, i) => (
                  <div key={i}
                    className={`h-2 w-10 rounded-full transition ${
                      i < shotIdx ? "bg-primary" : i === shotIdx ? "bg-accent" : "bg-secondary"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PROCESSING ── mirrors laptop Processing screen exactly */}
        {state === "processing" && (
          <motion.div
            key="p"
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
        )}

        {/* ── PREVIEW ── mirrors laptop Preview screen exactly */}
        {state === "preview" && stripUrl && (
          <motion.div
            key="pv"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center gap-6 p-4 sm:p-8 overflow-y-auto"
          >
            {/* Strip image with spring animation — same as laptop */}
            <motion.div
              initial={{ scale: 0.7, rotate: -4 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 14 }}
              className="shrink-0"
            >
              <img
                src={stripUrl}
                alt="Photo strip"
                className="h-[60vh] lg:h-[85vh] max-w-full w-auto rounded-xl shadow-2xl neon-border bg-white"
              />
            </motion.div>

            {/* Buttons panel — same as laptop */}
            <div className="flex flex-col gap-3 w-full max-w-sm">
              <div className="text-center mb-2">
                <div className="text-3xl font-black neon-text">Looking Great!</div>
                <div className="text-muted-foreground text-sm">{eventName}</div>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="p-3 rounded-2xl text-xs leading-normal border text-center font-medium shadow-md bg-primary/10 border-primary/20 text-primary"
              >
                📢 <strong>Hint:</strong> If you want to print your photos, please click on the <strong>Print Photo</strong> button below!
              </motion.div>

              <TabletBigBtn onClick={handleRetake} icon={<RefreshCw />} label="Retake Photos" tone="secondary" />
              {enablePrint && <TabletBigBtn onClick={handlePrint} icon={<Printer />} label="Print Photo" tone="primary" />}
              <TabletBigBtn onClick={handleDownload} icon={<Download />} label="Download" tone="secondary" />
              {enableQR && <TabletBigBtn onClick={handleQR} icon={<QrCode />} label="Generate QR Code" tone="accent" />}
              <button onClick={handleGoHome} className="mt-2 text-muted-foreground hover:text-foreground py-2">← Back to start</button>
            </div>

            {/* QR modal */}
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
        )}

        {/* ── PREVIEW waiting for strip ── */}
        {state === "preview" && !stripUrl && (
          <motion.div
            key="pv-wait"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center"
          >
            <RobotFace size={220} />
            <h2 className="text-4xl sm:text-6xl font-black neon-text">Creating Photo Strip</h2>
            <div className="w-72 max-w-full h-3 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full"
                style={{ background: "linear-gradient(90deg, var(--neon), var(--neon-2))" }}
                animate={{ width: ["5%", "90%"] }}
                transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
              />
            </div>
            <div className="text-muted-foreground">AI is composing your memory…</div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

function TabletBigBtn({
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
