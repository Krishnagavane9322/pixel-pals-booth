import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStrip, logDownload, type StripRecord } from "@/lib/booth-storage";
import { getCloudPhoto, getStripData } from "@/lib/server-storage";
import { Download, Share2 } from "lucide-react";

export const Route = createFileRoute("/photo/$id")({
  head: () => ({
    meta: [
      { title: "Your ROVI Photo Strip" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: PhotoPage,
});

function PhotoPage() {
  const { id } = Route.useParams();
  const [rec, setRec] = useState<StripRecord | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadPhoto() {
      // 1. Try local storage first (instant if running on the kiosk device)
      const local = getStrip(id);
      if (local) {
        if (!cancelled) setRec(local);
        return;
      }

      // 2. Try server storage (reads file directly from server public/photos/<id>.jpg)
      try {
        const res = await getStripData({ data: id });
        if (!cancelled && res && res.success && res.dataUrl) {
          setRec({
            id,
            dataUrl: res.dataUrl,
            eventName: "ROVI AI Photo Booth",
            createdAt: Date.now(),
          });
          return;
        }
      } catch (err) {
        console.warn("getStripData failed in photo view:", err);
      }

      // 3. Fall back to Vercel Blob cloud storage
      try {
        const res = await getCloudPhoto({ data: id });
        if (!cancelled && res && res.success && res.data) {
          setRec({
            id,
            dataUrl: res.data.url,
            eventName: res.data.eventName,
            createdAt: res.data.createdAt,
          });
          return;
        }
      } catch (err) {
        console.error("Failed to fetch cloud photo:", err);
      }

      if (!cancelled) setRec(null);
    }

    loadPhoto();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const download = async () => {
    if (!rec) return;

    // Web Share API for iOS / Android mobile devices
    if (typeof navigator !== "undefined" && navigator.share && rec.dataUrl.startsWith("data:")) {
      try {
        const blob = await (await fetch(rec.dataUrl)).blob();
        const file = new File([blob], `rovi-photo-${rec.id}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "My ROVI Photo Strip",
            files: [file],
          });
          logDownload(rec.id);
          return;
        }
      } catch (e) {
        console.warn("Native share cancelled or unsupported, falling back to download:", e);
      }
    }

    // Standard download fallback
    const a = document.createElement("a");
    a.href = rec.dataUrl;
    a.download = `rovi-photo-${rec.id}.jpg`;
    a.target = "_blank";
    a.click();
    logDownload(rec.id);
  };

  if (rec === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center grid-bg text-muted-foreground p-6">
        <div className="text-xl font-bold neon-text animate-pulse">Loading Photo Strip…</div>
      </div>
    );
  }

  if (rec === null) {
    return (
      <div className="min-h-screen grid-bg flex flex-col items-center justify-center p-6 text-center gap-4">
        <h1 className="text-3xl font-black neon-text">Photo Not Found</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          The photo strip could not be found or has expired. Make sure your phone is connected to
          the same Wi-Fi network as the photo booth.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg flex flex-col items-center justify-center gap-6 p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-black neon-text">Your Photo Strip</h1>
      <img
        src={rec.dataUrl}
        alt="Photo strip"
        className="h-[65vh] sm:h-[75vh] max-w-full w-auto rounded-2xl shadow-2xl neon-border bg-white object-contain"
      />
      <button
        onClick={download}
        className="flex items-center gap-3 bg-primary text-primary-foreground rounded-2xl px-8 py-4 text-xl font-bold shadow-lg hover:scale-105 active:scale-95 transition"
      >
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Share2 className="w-6 h-6" />
        ) : (
          <Download className="w-6 h-6" />
        )}
        <span>Save / Share Photo</span>
      </button>
      <div className="text-xs text-muted-foreground">{rec.eventName}</div>
    </div>
  );
}
