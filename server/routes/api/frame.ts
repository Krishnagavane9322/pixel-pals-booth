// /api/frame — Ultra-low-latency live camera frame relay for tablet preview.
//
// The SSE broker is broken on Vercel Serverless (lambda isolation), so
// CAMERA_FRAME events never reach the tablet via the event bus.
// This endpoint is a direct, minimal frame store:
//   POST: kiosk writes the latest JPEG frame for the channel
//   GET:  tablet reads the latest frame (no SSE, pure polling at ~100ms)
//
// Frames are stored ONLY in globalThis (no disk write) because:
// - Frames are time-sensitive — a stale disk frame is useless
// - Disk I/O would add unacceptable latency at 150ms polling
// - If the lambda is cold (different container), we return null and the
//   tablet simply keeps showing its last good frame.
//
// A frame older than 3 seconds is considered stale and is dropped.

import { defineHandler } from "h3";

type FrameEntry = { frame: string; ts: number };

const g = globalThis as any;
if (!g.__frameStore) g.__frameStore = new Map<string, FrameEntry>();
const frameStore: Map<string, FrameEntry> = g.__frameStore;

const FRAME_STALE_MS = 3000; // Drop frames older than 3 seconds

export default defineHandler(async (event) => {
  const method = event.req.method ?? "GET";
  const url = new URL(event.req.url);
  const channel = url.searchParams.get("channel") ?? "default";

  if (method === "POST") {
    let body: { frame?: string } = {};
    try {
      const text = await new Response(event.req.body as any).text();
      body = JSON.parse(text);
    } catch {
      return Response.json({ success: false }, { status: 400 });
    }

    if (body.frame) {
      frameStore.set(channel, { frame: body.frame, ts: Date.now() });
    }

    return Response.json({ success: true });
  }

  if (method === "GET") {
    const entry = frameStore.get(channel);

    // Return null if no frame or frame is stale (camera stopped)
    if (!entry || Date.now() - entry.ts > FRAME_STALE_MS) {
      return Response.json({ frame: null });
    }

    return Response.json({ frame: entry.frame, ts: entry.ts });
  }

  return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
});
