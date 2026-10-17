import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer,
  X,
  CheckCircle2,
  Copy,
  Scissors,
  Sparkles,
  Loader2,
  RotateCcw,
  Wifi,
  ExternalLink,
} from "lucide-react";
import { preparePrintSheet, printViaBrowser, type PrintSheetResult } from "@/lib/browser-print";
import { speak } from "@/lib/audio";
import type { Settings } from "@/lib/booth-storage";

export interface PrintModalProps {
  open: boolean;
  onClose: () => void;
  strip: { id: string; dataUrl: string } | null;
  settings: Settings;
  isKiosk?: boolean;
  onPrintComplete?: () => void;
  onRemotePrintSpool?: (stripId: string, dataUrl: string, copies: number) => void;
}

type PrintStatus = "idle" | "preparing" | "printing" | "success" | "error";

export function PrintModal({
  open,
  onClose,
  strip,
  settings,
  isKiosk = true,
  onPrintComplete,
  onRemotePrintSpool,
}: PrintModalProps) {
  const [copies, setCopies] = useState<number>(1);
  const [status, setStatus] = useState<PrintStatus>("idle");
  const [sheet, setSheet] = useState<PrintSheetResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null);

  const isFloral = settings.theme === "floral";
  const is4x6 = settings.printLayout === "4x6" || settings.printLayout === "4x6-1shot";
  const printerName = settings.printerName || "DS-RX1";

  // Prepare the printable sheet whenever the modal opens or strip changes
  useEffect(() => {
    if (!open || !strip?.dataUrl) {
      setSheet(null);
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setStatus("preparing");

    preparePrintSheet(strip.dataUrl, settings.printLayout || "2x6")
      .then((res) => {
        if (isMounted) {
          setSheet(res);
          setStatus("idle");
        }
      })
      .catch((err) => {
        console.error("[PrintModal] Failed to prepare print sheet:", err);
        if (isMounted) {
          setSheet({
            sheetDataUrl: strip.dataUrl,
            isDoubleStrip: false,
            width: is4x6 ? 1800 : 600,
            height: is4x6 ? 1200 : 1800,
          });
          setStatus("idle");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, strip?.dataUrl, settings.printLayout, is4x6]);

  // Voice announcement when modal opens
  useEffect(() => {
    if (open && status === "idle") {
      speak(
        "Ready to print. Select your copies and tap Print Now.",
        settings.enableVoice !== false,
      );
    }
  }, [open, status === "idle", settings.enableVoice]);

  // Handle countdown for automatic dismissal after successful print
  useEffect(() => {
    if (status !== "success") {
      if (autoCloseTimer) clearInterval(autoCloseTimer);
      return;
    }

    let secondsLeft = 6;
    setAutoCloseTimer(secondsLeft);

    const interval = setInterval(() => {
      secondsLeft -= 1;
      setAutoCloseTimer(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(interval);
        onClose();
        if (onPrintComplete) onPrintComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  if (!open || !strip) return null;

  const handleStartPrint = async () => {
    if (!sheet) return;
    setStatus("printing");
    setErrorMessage(null);

    speak("Sending to printer now!", settings.enableVoice !== false);

    const printSheetDataUrl = sheet.sheetDataUrl;

    try {
      // 1. Spool to local print agent on port 3100 if running on Windows laptop
      let spooledDirect = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const agentRes = await fetch("http://localhost:3100/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: strip.id,
            dataUrl: printSheetDataUrl,
            printerName,
            printLayout: settings.printLayout,
            copies,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (agentRes.ok) {
          const json = await agentRes.json();
          if (json.success) spooledDirect = true;
        }
      } catch {}

      // 2. Dispatch to backend Nitro /api/print queue
      fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: strip.id,
          dataUrl: printSheetDataUrl,
          printerName,
          printLayout: settings.printLayout,
          copies,
        }),
      }).catch((e) => console.warn("[PrintModal] /api/print warning:", e));

      // 3. If triggered from tablet, notify kiosk via callback
      if (!isKiosk && onRemotePrintSpool) {
        onRemotePrintSpool(strip.id, printSheetDataUrl, copies);
      }

      // 4. Always trigger browser native print engine (supports AirPrint, system photo printers, PDFs)
      // This guarantees the user sees the real print dialog or print job completes in browser!
      await printViaBrowser(printSheetDataUrl, {
        copies,
        layout: settings.printLayout,
        title: `${settings.eventName || "Photo Strip"} - Print`,
      });

      setStatus("success");
    } catch (err: any) {
      console.error("[PrintModal] Print error:", err);
      setStatus("error");
      setErrorMessage(err?.message || "Failed to launch printer. Please try again.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99995] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-4xl max-h-[92vh] rounded-3xl border shadow-2xl overflow-hidden flex flex-col ${
            isFloral
              ? "bg-[#fff9fa] border-[#ffccd9] text-gray-800"
              : "bg-card/95 border-border text-foreground neon-border"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isFloral ? "bg-[#ffe0ea] text-[#b03b60]" : "bg-primary/20 text-primary"
                }`}
              >
                <Printer className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">Print Photo Strip</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Target: <strong className="font-semibold text-foreground">{printerName}</strong> &
                  System Printer
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-muted/50 active:scale-95 transition text-muted-foreground hover:text-foreground"
              aria-label="Close Print Window"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-6 flex flex-col md:flex-row gap-6 items-center justify-center overflow-y-auto flex-1">
            {/* Sheet Preview Area */}
            <div className="flex flex-col items-center justify-center w-full md:w-1/2">
              <div
                className={`relative p-3 rounded-2xl shadow-xl border max-w-full flex items-center justify-center ${
                  isFloral ? "bg-white border-pink-100" : "bg-black/40 border-white/10"
                }`}
              >
                {status === "preparing" ? (
                  <div className="h-64 sm:h-80 w-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-xs font-medium">Composing print sheet…</span>
                  </div>
                ) : sheet ? (
                  <div className="relative group">
                    <img
                      src={sheet.sheetDataUrl}
                      alt="Print Sheet Preview"
                      className="max-h-[50vh] sm:max-h-[55vh] w-auto rounded-lg shadow-lg object-contain bg-white"
                    />

                    {/* Cut line helper badge for 2x6 double strip */}
                    {sheet.isDoubleStrip && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 text-white backdrop-blur text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shadow pointer-events-none">
                        <Scissors className="w-3.5 h-3.5 text-yellow-400" />
                        <span>4x6" Sheet (2 Strips with Cut Line)</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-64 w-48 flex items-center justify-center text-muted-foreground text-xs">
                    No preview available
                  </div>
                )}
              </div>

              {sheet?.isDoubleStrip && (
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  💡 Prints <strong>2 identical photo strips</strong> side-by-side on 4x6" paper to
                  cut.
                </p>
              )}
            </div>

            {/* Print Controls & Action Area */}
            <div className="w-full md:w-1/2 flex flex-col justify-between gap-5">
              {status === "success" ? (
                /* Success State */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center flex flex-col items-center gap-3"
                >
                  <div className="p-3 bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black text-emerald-400">Print Job Sent!</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Your photo strip has been sent to the printer. Check the printer tray in a few
                    seconds!
                  </p>

                  {autoCloseTimer !== null && (
                    <div className="text-xs text-muted-foreground font-medium mt-1">
                      Returning to booth in{" "}
                      <span className="font-bold text-foreground">{autoCloseTimer}s</span>…
                    </div>
                  )}

                  <div className="flex gap-3 w-full mt-2">
                    <button
                      onClick={() => setStatus("idle")}
                      className="flex-1 py-3 px-4 rounded-xl font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm flex items-center justify-center gap-2 transition"
                    >
                      <RotateCcw className="w-4 h-4" /> Print More
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        if (onPrintComplete) onPrintComplete();
                      }}
                      className="flex-1 py-3 px-4 rounded-xl font-bold bg-primary text-primary-foreground text-sm shadow hover:opacity-90 transition"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              ) : status === "printing" ? (
                /* Printing In-Progress State */
                <div className="p-8 rounded-2xl bg-primary/10 border border-primary/20 text-center flex flex-col items-center gap-4">
                  <Printer className="w-12 h-12 text-primary animate-bounce" />
                  <h3 className="text-xl font-black neon-text">Opening Print Dialog…</h3>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Sending photo strip to <strong>{printerName}</strong> & opening your system
                    printer dialog.
                  </p>
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      animate={{ width: ["15%", "95%"] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              ) : (
                /* Idle / Controls State */
                <div className="flex flex-col gap-5">
                  {/* Copies Selector */}
                  <div className="p-4 rounded-2xl bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold flex items-center gap-2">
                        <Copy className="w-4 h-4 text-primary" /> Number of Copies
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {sheet?.isDoubleStrip
                          ? `${copies * 2} strips total`
                          : `${copies} print${copies > 1 ? "s" : ""}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 bg-background/80 rounded-xl p-1 border">
                        <button
                          type="button"
                          onClick={() => setCopies((c) => Math.max(1, c - 1))}
                          className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center font-black text-lg transition active:scale-95"
                          aria-label="Decrease copies"
                        >
                          -
                        </button>
                        <span className="w-12 text-center text-xl font-black tabular-nums">
                          {copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCopies((c) => Math.min(10, c + 1))}
                          className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center font-black text-lg transition active:scale-95"
                          aria-label="Increase copies"
                        >
                          +
                        </button>
                      </div>

                      {/* Quick preset buttons */}
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 4].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCopies(preset)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                              copies === preset
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                            }`}
                          >
                            {preset}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Print Specifications */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">
                        Paper Format
                      </span>
                      <span className="font-semibold text-foreground mt-0.5 block">
                        {is4x6 ? "4x6 Postcard" : "4x6 Sheet (2x6 Cut)"}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">
                        Resolution
                      </span>
                      <span className="font-semibold text-foreground mt-0.5 block">
                        300 DPI Dye-Sub
                      </span>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold text-center">
                      ⚠️ {errorMessage}
                    </div>
                  )}

                  {/* Print Action Buttons */}
                  <div className="flex flex-col gap-2 pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleStartPrint}
                      disabled={status === "preparing"}
                      className={`w-full py-4 px-6 rounded-2xl font-black text-lg sm:text-xl shadow-xl flex items-center justify-center gap-3 transition ${
                        isFloral
                          ? "bg-gradient-to-r from-[#e0497f] to-[#ff7597] text-white hover:brightness-105"
                          : "bg-primary text-primary-foreground hover:brightness-110 shadow-primary/30"
                      }`}
                    >
                      <Printer className="w-6 h-6 animate-pulse" />
                      <span>
                        Print Now ({copies} {copies > 1 ? "Copies" : "Copy"})
                      </span>
                    </motion.button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="py-2.5 text-xs text-muted-foreground hover:text-foreground text-center transition"
                    >
                      Cancel / Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
