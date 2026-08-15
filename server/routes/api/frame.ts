// /api/frame — Ultra-low-latency live camera frame relay for tablet preview.
// Uses official h3 readBody and getQuery helpers compatible with Nitro / Vercel.

import { defineEventHandler, getQuery, readBody } from "h3";

type FrameEntry = { frame: string; ts: number };

const g = globalThis as any;
if (!g.__frameStore) g.__frameStore = new Map<string, FrameEntry>();
const frameStore: Map<string, FrameEntry> = g.__frameStore;

const FRAME_STALE_MS = 4000; // Drop frames older than 4 seconds

export default defineEventHandler(async (event) => {
  const method = event.method;
  const query = getQuery(event);
  const channel = String(query.channel || "default");

  if (method === "POST") {
    try {
      const body = (await readBody(event)) as { frame?: string };
      if (body && body.frame) {
        frameStore.set(channel, { frame: body.frame, ts: Date.now() });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  if (method === "GET") {
    const entry = frameStore.get(channel);

    // Return null if no frame or frame is stale (camera stopped)
    if (!entry || Date.now() - entry.ts > FRAME_STALE_MS) {
      return { frame: null };
    }

    return { frame: entry.frame, ts: entry.ts };
  }

  return { success: false, error: "Method not allowed" };
});
