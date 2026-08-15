import { createServerFn } from "@tanstack/react-start";
import { put, list } from "@vercel/blob";
import fs from "fs";
import path from "path";

export type CloudPhotoData = {
  url: string;
  eventName: string;
  createdAt: number;
};

// ── Client HTTP API helpers for Nitro /api/strip ─────────────────────────
export async function uploadStripToApi(id: string, dataUrl: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/strip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dataUrl }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[Client] API upload photo strip fallback:", e);
    return false;
  }
}

export async function fetchStripFromApi(id: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/api/strip?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success && json.dataUrl) {
      return json.dataUrl;
    }
  } catch (e) {
    console.warn("[Client] API fetch photo strip fallback:", e);
  }
  return null;
}

// ── Server-side in-memory strip store ──────────────────────────────────────
// Stores base64 data URLs keyed by photo ID so the tablet can retrieve them
// from the Vercel server without hitting local disk or Pusher payload limits.
// TTL: 30 minutes per entry.
type StripEntry = { dataUrl: string; createdAt: number };
const stripStore = new Map<string, StripEntry>();

// Cleanup entries older than 30 minutes periodically
const STRIP_TTL_MS = 30 * 60 * 1000;
function cleanupStripStore() {
  const now = Date.now();
  for (const [key, entry] of stripStore.entries()) {
    if (now - entry.createdAt > STRIP_TTL_MS) {
      stripStore.delete(key);
    }
  }
}

// ── Server function to store photo strip base64 on server ──────────────────
export const storeStripData = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const data = rawPayload?.data ?? rawPayload;
    if (data && data.id && data.dataUrl) {
      cleanupStripStore();
      stripStore.set(data.id, { dataUrl: data.dataUrl, createdAt: Date.now() });

      // Save to serverless disk (/tmp/photos/<id>.jpg) as backup
      try {
        const base64Data = data.dataUrl.includes(",") ? data.dataUrl.split(",")[1] : data.dataUrl;
        const buffer = Buffer.from(base64Data, "base64");
        const os = await import("os");
        const dir = path.join(os.tmpdir(), "photos");
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        await fs.promises.writeFile(path.join(dir, `${data.id}.jpg`), buffer);
      } catch (e) {
        console.warn("[ServerStorage] Temp disk backup skipped:", e);
      }
    }
    return { success: true };
  });

// Server function to upload photo strip to Vercel Blob
export const uploadPhoto = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const data = rawPayload?.data ?? rawPayload;
    // Check if token exists, if not fall back to local disk storage
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn("BLOB_READ_WRITE_TOKEN environment variable is not defined. Saving to local public/photos/.");
      try {
        const base64Data = data.dataUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        let dir = path.join(process.cwd(), "public", "photos");
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        } catch {
          // Read-only filesystem on Vercel Serverless — fallback to OS temp dir
          const os = await import("os");
          dir = path.join(os.tmpdir(), "photos");
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        }

        const filename = `${data.id}.jpg`;
        const filePath = path.join(dir, filename);
        await fs.promises.writeFile(filePath, buffer);

        return { success: true, url: `/photos/${filename}` };
      } catch (err: any) {
        console.error("Failed to save local photo:", err);
        return { success: false, error: "Offline local save failed: " + err.message };
      }
    }

    try {
      const base64Data = data.dataUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");

      const filename = `photos/${data.id}___${encodeURIComponent(data.eventName)}___${Date.now()}.jpg`;
      const blob = await put(filename, buffer, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });

      return { success: true, url: blob.url };
    } catch (err: any) {
      console.error("Failed to upload photo to Vercel Blob:", err);
      return { success: false, error: err.message };
    }
  });

// Server function to get strip as base64 data URL (for tablet preview)
// Checks in-memory store first (works on Vercel), then falls back to local disk
export const getStripData = createServerFn({ method: "GET" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const id = typeof rawPayload === "string" ? rawPayload : (rawPayload?.data ?? rawPayload);
    // 1. Check in-memory store first (works on Vercel deployment)
    const inMemory = stripStore.get(id);
    if (inMemory) {
      return { success: true, dataUrl: inMemory.dataUrl };
    }

    // 2. Fall back to local disk (public/photos AND os.tmpdir()/photos)
    try {
      const filename = `${id}.jpg`;
      const publicDir = path.join(process.cwd(), "public", "photos");
      let filePath = path.join(publicDir, filename);

      if (!fs.existsSync(filePath)) {
        const os = await import("os");
        const tmpDir = path.join(os.tmpdir(), "photos");
        filePath = path.join(tmpDir, filename);
      }

      if (fs.existsSync(filePath)) {
        const buffer = await fs.promises.readFile(filePath);
        const base64 = buffer.toString("base64");
        return { success: true, dataUrl: `data:image/jpeg;base64,${base64}` };
      }
      return { success: false, error: "File not found" };
    } catch (err: any) {
      console.error("Failed to read strip file:", err);
      return { success: false, error: err.message };
    }
  });

// Server function to fetch photo strip from Vercel Blob
export const getCloudPhoto = createServerFn({ method: "GET" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const id = typeof rawPayload === "string" ? rawPayload : (rawPayload?.data ?? rawPayload);
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const filename = `${id}.jpg`;
        const dir = path.join(process.cwd(), "public", "photos");
        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          return {
            success: true,
            data: {
              url: `/photos/${filename}`,
              eventName: "ROVI Live Event",
              createdAt: stats.mtimeMs,
            } as CloudPhotoData,
          };
        }
      } catch (err: any) {
        console.error("Failed to read local photo for cloud detail:", err);
      }
      return { success: false, error: "No token and not found locally" };
    }

    try {
      // Find the file by prefix matching the photo ID
      const { blobs } = await list({ prefix: `photos/${id}` });
      if (blobs.length === 0) {
        return { success: false, error: "Not found" };
      }

      const blobInfo = blobs[0];
      
      let eventName = "ROVI Live Event";
      let createdAt = blobInfo.uploadedAt ? blobInfo.uploadedAt.getTime() : Date.now();

      const parts = blobInfo.pathname.split("___");
      if (parts.length >= 3) {
        try {
          eventName = decodeURIComponent(parts[1]);
          const timeStr = parts[2].replace(/\.[^/.]+$/, "");
          createdAt = Number(timeStr);
        } catch (e) {
          console.warn("Failed to parse eventName or createdAt from pathname:", e);
        }
      }

      return {
        success: true,
        data: {
          url: blobInfo.url,
          eventName,
          createdAt,
        } as CloudPhotoData,
      };
    } catch (err: any) {
      console.error("Failed to fetch photo from Vercel Blob:", err);
      return { success: false, error: err.message };
    }
  });
