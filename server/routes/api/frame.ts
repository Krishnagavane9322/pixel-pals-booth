// /api/frame — Low-latency live camera frame relay with disk backup for cross-lambda sharing on Vercel.

import { defineEventHandler, getQuery, readBody } from "h3";
import fs from "fs";
import path from "path";
import os from "os";

type FrameEntry = { frame: string; ts: number };

const g = globalThis as any;
if (!g.__frameStore) g.__frameStore = new Map<string, FrameEntry>();
const frameStore: Map<string, FrameEntry> = g.__frameStore;

const FRAME_STALE_MS = 5000; // Drop frames older than 5 seconds

function getTmpFramePath(channel: string): string {
  const safe = channel.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(os.tmpdir(), `rovi-frame-${safe}.jpg`);
}

export default defineEventHandler(async (event) => {
  const method = event.method;
  const query = getQuery(event);
  const channel = String(query.channel || "default");
  const tmpPath = getTmpFramePath(channel);

  if (method === "POST") {
    try {
      const body = (await readBody(event)) as { frame?: string };
      if (body && body.frame) {
        const now = Date.now();
        frameStore.set(channel, { frame: body.frame, ts: now });

        // Save to /tmp for cross-lambda sharing on Vercel
        try {
          const base64Data = body.frame.includes(",") ? body.frame.split(",")[1] : body.frame;
          const buffer = Buffer.from(base64Data, "base64");
          fs.writeFileSync(tmpPath, buffer);
        } catch (e) {}
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  if (method === "GET") {
    // 1. Check in-memory store
    const entry = frameStore.get(channel);
    if (entry && Date.now() - entry.ts <= FRAME_STALE_MS) {
      return { frame: entry.frame, ts: entry.ts };
    }

    // 2. Fall back to /tmp disk file (cross-lambda sharing)
    try {
      if (fs.existsSync(tmpPath)) {
        const stats = fs.statSync(tmpPath);
        if (Date.now() - stats.mtimeMs <= FRAME_STALE_MS) {
          const buffer = fs.readFileSync(tmpPath);
          const base64 = buffer.toString("base64");
          const frame = `data:image/jpeg;base64,${base64}`;
          frameStore.set(channel, { frame, ts: stats.mtimeMs }); // hydrate memory
          return { frame, ts: stats.mtimeMs };
        }
      }
    } catch (e) {}

    return { frame: null, ts: 0 };
  }

  return { success: false, error: "Method not allowed" };
});
