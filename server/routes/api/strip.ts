import { defineEventHandler, getQuery, readBody } from "h3";
import fs from "fs";
import path from "path";
import os from "os";

type StripEntry = { dataUrl: string; blobUrl?: string; createdAt: number };
const globalStripStore = (globalThis as any).__globalStripStore || new Map<string, StripEntry>();
(globalThis as any).__globalStripStore = globalStripStore;

// Clean entries older than 60 minutes
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of globalStripStore.entries()) {
    if (now - entry.createdAt > 60 * 60 * 1000) {
      globalStripStore.delete(key);
    }
  }
}

async function uploadToBlob(id: string, base64Data: string): Promise<string | null> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;

    const { put } = await import("@vercel/blob");
    const buffer = Buffer.from(base64Data, "base64");
    const blob = await put(`print-strips/${id}.jpg`, buffer, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    console.log(`[Strip API] Uploaded strip ${id} to Vercel Blob: ${blob.url}`);
    return blob.url;
  } catch (e) {
    console.warn("[Strip API] Blob upload failed:", e);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "POST") {
    try {
      const body = (await readBody(event)) as { id?: string; dataUrl?: string };
      const { id, dataUrl } = body || {};
      if (id && dataUrl) {
        cleanup();

        const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

        // 1. Store in-memory
        globalStripStore.set(id, { dataUrl, createdAt: Date.now() });

        // 2. Save to /tmp disk as fallback
        try {
          const buffer = Buffer.from(base64Data, "base64");
          const tmpDir = path.join(os.tmpdir(), "photos");
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          await fs.promises.writeFile(path.join(tmpDir, `${id}.jpg`), buffer);
        } catch (e) {}

        // 3. Upload to Vercel Blob for reliable cross-lambda access
        const blobUrl = await uploadToBlob(id, base64Data);
        if (blobUrl) {
          globalStripStore.set(id, { dataUrl, blobUrl, createdAt: Date.now() });
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  if (method === "GET") {
    const query = getQuery(event);
    const id = String(query.id || "");
    if (!id) return { success: false, error: "Missing id parameter" };

    // 1. Check in-memory (has blobUrl if blob upload succeeded)
    const inMem = globalStripStore.get(id);
    if (inMem?.blobUrl) {
      return { success: true, blobUrl: inMem.blobUrl, dataUrl: inMem.dataUrl };
    }
    if (inMem?.dataUrl) {
      return { success: true, dataUrl: inMem.dataUrl };
    }

    // 2. Check Vercel Blob by known URL pattern
    try {
      const { list } = await import("@vercel/blob");
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token) {
        const { blobs } = await list({ prefix: `print-strips/${id}` });
        if (blobs.length > 0) {
          return { success: true, blobUrl: blobs[0].url };
        }
      }
    } catch (e) {}

    // 3. Check disk /tmp
    try {
      const tmpPath = path.join(os.tmpdir(), "photos", `${id}.jpg`);
      const pubPath = path.join(process.cwd(), "public", "photos", `${id}.jpg`);
      const targetPath = fs.existsSync(pubPath) ? pubPath : fs.existsSync(tmpPath) ? tmpPath : null;
      if (targetPath) {
        const buffer = await fs.promises.readFile(targetPath);
        return { success: true, dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}` };
      }
    } catch (e) {}

    return { success: false, error: "Strip not found" };
  }

  return { success: false, error: "Method not allowed" };
});
