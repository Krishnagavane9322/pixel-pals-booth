import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Pusher from "pusher-js";
import { sendPusherEvent } from "@/lib/pusher";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, RefreshCw, Camera, ArrowLeft, WifiOff, AlertTriangle } from "lucide-react";
import { RobotFace } from "@/components/RobotFace";

const searchSchema = z.object({
  channel: z.string().default("rovi-booth-default"),
});

export const Route = createFileRoute("/tablet")({
  validateSearch: (search) => searchSchema.parse(search),
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

  const [connected, setConnected] = useState(false);
  const [configError, setConfigError] = useState(false);
  const pusherRef = useRef<Pusher | null>(null);

  const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY;
  const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;

  const numShots = printLayout === "4x6" ? 4 : 3;

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
    }) => {
      setState(msg.screen);
      setCount(msg.count);
      setShotIdx(msg.shotIdx);
      setFlash(msg.flash);
      if (msg.eventName) setEventName(msg.eventName);
      if (msg.printLayout) setPrintLayout(msg.printLayout);
    });

    pusherChannel.bind("PHOTO_READY", (msg: { dataUrl: string }) => {
      setStripUrl(msg.dataUrl);
      setState("preview");
    });

    pusherChannel.bind("RESET", () => {
      setState("welcome");
      setStripUrl(null);
    });

    return () => {
      pusherChannel.unbind_all();
      pusher.unsubscribe(channel);
      pusher.disconnect();
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

  const handleStart = () => {
    triggerEvent("START_CAPTURE");
    setState("camera");
  };

  const handlePrint = () => {
    triggerEvent("TRIGGER_PRINT");
  };

  const handleRetake = () => {
    triggerEvent("START_CAPTURE");
    setState("camera");
  };

  const handleGoHome = () => {
    triggerEvent("GO_HOME");
    setState("welcome");
    setStripUrl(null);
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
    <div className="fixed inset-0 bg-neutral-950 text-white flex flex-col select-none justify-center items-center p-6 text-center overflow-y-auto">
      {/* Small channel tag */}
      <div className="absolute top-4 left-4 text-xs font-mono text-muted-foreground/30">
        CH: {channel}
      </div>

      <AnimatePresence mode="wait">
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
              className="text-5xl sm:text-7xl font-black neon-text"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              TOUCH TO START
            </motion.h1>
            <div className="text-muted-foreground text-sm">Wireless Remote Control Enabled</div>
          </motion.button>
        )}

        {state === "camera" && (
          <motion.div
            key="c"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col justify-between py-6"
          >
            {/* Header info */}
            <div className="flex items-center justify-between px-6">
              <div className="text-sm tracking-widest text-muted-foreground">PHOTO {shotIdx + 1} / {numShots}</div>
              <button 
                onClick={handleGoHome} 
                className="px-4 py-2 text-xs rounded-xl bg-neutral-900 border border-neutral-800 text-muted-foreground hover:text-white"
              >
                Cancel
              </button>
            </div>

            {/* Live DSLR View Stream from digiCamControl */}
            <div className="flex-1 relative flex items-center justify-center px-4 py-2">
              <div className="relative w-full max-w-3xl aspect-[4/3] rounded-3xl overflow-hidden neon-border bg-black">
                <img
                  src={`http://${window.location.hostname}:8080/liveview.mjpg`}
                  alt="DSLR Live Stream"
                  className="absolute inset-0 w-full h-full object-cover transform scaleX(-1)"
                  onError={(e) => {
                    // Hide image and show simple message if DSLR stream is offline
                    e.currentTarget.style.display = "none";
                    const container = e.currentTarget.parentElement;
                    if (container) {
                      const msgDiv = container.querySelector(".fallback-preview");
                      if (msgDiv) msgDiv.classList.remove("hidden");
                    }
                  }}
                />
                
                {/* Fallback helper when camera is not turned on */}
                <div className="fallback-preview hidden absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-2">
                  <Camera className="w-10 h-10 text-muted-foreground animate-pulse" />
                  <p className="text-sm text-muted-foreground font-semibold">DSLR Live View Offline</p>
                  <p className="text-[10px] text-muted-foreground/60 max-w-xs">
                    Please ensure digiCamControl is running on your laptop and your Nikon D5600 is powered on.
                  </p>
                </div>

                {/* Mirrored countdown animation */}
                <AnimatePresence>
                  {count !== null && (
                    <motion.div
                      key={count}
                      initial={{ scale: 2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/20"
                    >
                      <div className="text-[14rem] sm:text-[18rem] font-black neon-text leading-none">{count}</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* White screen camera flash mirroring */}
                {flash && <div className="absolute inset-0 bg-white" />}
              </div>
            </div>

            {/* Bottom count status */}
            <div className="text-center px-4">
              <motion.div
                className="text-3xl font-black neon-text"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                {count === null ? "Get Ready" : "Smile!"}
              </motion.div>
              <div className="mt-3 flex justify-center gap-2">
                {Array.from({ length: numShots }).map((_, i) => (
                  <div key={i}
                    className={`h-2 w-10 rounded-full transition ${
                      i < shotIdx ? "bg-primary" : i === shotIdx ? "bg-accent" : "bg-neutral-800"
                    }`} 
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {state === "processing" && (
          <motion.div
            key="p"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center"
          >
            <RobotFace size={200} />
            <h2 className="text-4xl font-black neon-text">Creating Photo Strip</h2>
            <div className="w-72 max-w-full h-3 rounded-full bg-neutral-900 overflow-hidden border border-neutral-850">
              <motion.div
                className="h-full"
                style={{ background: "linear-gradient(90deg, var(--neon), var(--neon-2))" }}
                initial={{ width: "5%" }} animate={{ width: ["5%", "85%", "100%"] }}
                transition={{ duration: 1.6, times: [0, 0.8, 1] }}
              />
            </div>
            <div className="text-muted-foreground text-sm">Please wait while the strip is generated...</div>
          </motion.div>
        )}

        {state === "preview" && stripUrl && (
          <motion.div
            key="p-view"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col lg:flex-row items-center gap-8 max-w-4xl w-full max-h-[90vh] p-4"
          >
            <img src={stripUrl} alt="Your Strip" className="h-[55vh] w-auto rounded-xl border border-neutral-800 shadow-2xl bg-white mx-auto" />
            
            <div className="flex flex-col gap-4 w-full max-w-sm shrink-0">
              <h2 className="text-3xl font-black neon-text">Looking Great!</h2>
              <p className="text-xs text-muted-foreground">Photos are saved and ready to print.</p>
              
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-3 bg-primary text-primary-foreground rounded-2xl py-5 text-xl font-bold shadow-lg hover:brightness-110 active:scale-96 transition"
              >
                <Printer className="w-6 h-6" /> Print Photo Strip
              </button>

              <button
                onClick={handleRetake}
                className="flex items-center justify-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl py-4 text-lg font-semibold hover:bg-neutral-800 active:scale-96 transition"
              >
                <RefreshCw className="w-5 h-5" /> Retake Photos
              </button>

              <button
                onClick={handleGoHome}
                className="mt-4 flex items-center justify-center gap-2 text-muted-foreground hover:text-white transition py-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to start
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
