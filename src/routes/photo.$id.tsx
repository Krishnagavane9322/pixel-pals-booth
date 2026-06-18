import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStrip, logDownload, type StripRecord } from "@/lib/booth-storage";
import { getCloudPhoto } from "@/lib/server-storage";
import { Download } from "lucide-react";

export const Route = createFileRoute("/photo/$id")({
  head: () => ({
    meta: [
      { title: "Your ROVI Photo" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: PhotoPage,
});

function PhotoPage() {
  const { id } = Route.useParams();
  const [rec, setRec] = useState<StripRecord | null | undefined>(undefined);

  useEffect(() => {
    // 1. Try local storage first (instant if running on the kiosk device)
    const local = getStrip(id);
    if (local) {
      setRec(local);
      return;
    }

    // 2. Fall back to Vercel Blob cloud storage
    getCloudPhoto({ data: id })
      .then((res) => {
        if (res && res.success && res.data) {
          setRec({
            id,
            dataUrl: res.data.url,
            eventName: res.data.eventName,
            createdAt: res.data.createdAt,
          });
        } else {
          setRec(null);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch cloud photo:", err);
        setRec(null);
      });
  }, [id]);

  const download = () => {
    if (!rec) return;
    const a = document.createElement("a");
    a.href = rec.dataUrl;
    a.download = `rovi-photo-${rec.id}.jpg`;
    a.click();
    logDownload(rec.id);
  };

  if (rec === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (rec === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-2xl font-black neon-text">Photo not found</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          This link must be opened on the same device the booth ran on. Ask the booth attendant for help.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-6">
      <h1 className="text-3xl font-black neon-text">Your Photo</h1>
      <img src={rec.dataUrl} alt="Photo strip" className="max-h-[75vh] rounded-xl shadow-2xl bg-white" />
      <button
        onClick={download}
        className="flex items-center gap-3 bg-primary text-primary-foreground rounded-2xl px-6 py-4 text-xl font-bold"
      >
        <Download /> Download
      </button>
      <div className="text-xs text-muted-foreground">{rec.eventName} · {new Date(rec.createdAt).toLocaleString()}</div>
    </div>
  );
}
