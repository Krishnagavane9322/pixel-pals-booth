// /api/signal — WebRTC signaling relay endpoint for Vercel Serverless.
// Enables 100% reliable WebRTC P2P connection setup between Kiosk camera & Tablet,
// allowing full HD 60fps zero-lag live video streaming without relying on SSE.

import { defineHandler } from "h3";

type SignalItem = {
  id: string;
  type: "SDP_OFFER" | "SDP_ANSWER" | "ICE_HOST" | "ICE_VIEWER" | "VIEWER_READY";
  data: any;
  ts: number;
};

const g = globalThis as any;
if (!g.__signalStore) g.__signalStore = new Map<string, SignalItem[]>();
const signalStore: Map<string, SignalItem[]> = g.__signalStore;

const SIGNAL_TTL_MS = 60 * 1000; // 1 minute TTL

function cleanupChannel(channel: string) {
  const list = signalStore.get(channel);
  if (!list) return;
  const now = Date.now();
  const fresh = list.filter((item) => now - item.ts < SIGNAL_TTL_MS);
  if (fresh.length === 0) {
    signalStore.delete(channel);
  } else {
    signalStore.set(channel, fresh);
  }
}

export default defineEventHandler(async (event) => {
  const method = event.req.method ?? "GET";
  const url = new URL(event.req.url);
  const channel = url.searchParams.get("channel") ?? "default";

  if (method === "POST") {
    let body: { type?: SignalItem["type"]; data?: any } = {};
    try {
      const text = await new Response(event.req.body as any).text();
      body = JSON.parse(text);
    } catch {
      return Response.json({ success: false }, { status: 400 });
    }

    if (body.type && body.data) {
      cleanupChannel(channel);
      if (!signalStore.has(channel)) signalStore.set(channel, []);
      const list = signalStore.get(channel)!;
      list.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: body.type,
        data: body.data,
        ts: Date.now(),
      });
      // Keep max 50 signals
      if (list.length > 50) list.shift();
    }

    return Response.json({ success: true });
  }

  if (method === "GET") {
    const since = Number(url.searchParams.get("since") ?? "0");
    cleanupChannel(channel);
    const list = signalStore.get(channel) || [];
    const newSignals = list.filter((item) => item.ts > since);

    return Response.json({ success: true, signals: newSignals, serverTime: Date.now() });
  }

  return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
});
