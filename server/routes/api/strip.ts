import { defineEventHandler, getQuery, readBody } from "h3";
import fs from "fs";
import path from "path";
import os from "os";

type StripEntry = { dataUrl: string; createdAt: number };
const globalStripStore = (globalThis as any).__globalStripStore || new Map<string, StripEntry>();
(globalThis as any).__globalStripStore = globalStripStore;

// Clean entries older than 30 minutes
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of globalStripStore.entries()) {
    if (now - entry.createdAt > 30 * 60 * 1000) {
      globalStripStore.delete(key);
    }
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
        globalStripStore.set(id, { dataUrl, createdAt: Date.now() });

        // Save to /tmp/photos/<id>.jpg for cross-lambda sharing on Vercel
        try {
          const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          const buffer = Buffer.from(base64Data, "base64");
          const tmpDir = path.join(os.tmpdir(), "photos");
          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
          }
          await fs.promises.writeFile(path.join(tmpDir, `${id}.jpg`), buffer);
        } catch (e) {}
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

    // 1. Check in-memory global store
    const inMem = globalStripStore.get(id);
    if (inMem) {
      return { success: true, dataUrl: inMem.dataUrl };
    }

    // 2. Check disk /tmp/photos/<id>.jpg or public/photos/<id>.jpg
    try {
      const filename = `${id}.jpg`;
      const publicPath = path.join(process.cwd(), "public", "photos", filename);
      const tmpPath = path.join(os.tmpdir(), "photos", filename);

      let targetPath = publicPath;
      if (!fs.existsSync(targetPath)) {
        targetPath = tmpPath;
      }

      if (fs.existsSync(targetPath)) {
        const buffer = await fs.promises.readFile(targetPath);
        const base64 = buffer.toString("base64");
        return { success: true, dataUrl: `data:image/jpeg;base64,${base64}` };
      }
    } catch (e) {}

    return { success: false, error: "Strip not found" };
  }

  return { success: false, error: "Method not allowed" };
});
