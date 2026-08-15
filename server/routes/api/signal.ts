// /api/signal — WebRTC signaling relay endpoint for Vercel Serverless.
// Uses official h3 readBody and getQuery helpers for Nitro / Vercel.

import { defineEventHandler, getQuery, readBody } from "h3";

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
  const method = event.method;
  const query = getQuery(event);
  const channel = String(query.channel || "default");

  if (method === "POST") {
    try {
      const body = (await readBody(event)) as { type?: SignalItem["type"]; data?: any };
      if (body && body.type && body.data) {
        cleanupChannel(channel);
        if (!signalStore.has(channel)) signalStore.set(channel, []);
        const list = signalStore.get(channel)!;
        list.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: body.type,
          data: body.data,
          ts: Date.now(),
        });
        if (list.length > 50) list.shift();
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  if (method === "GET") {
    const since = Number(query.since || "0");
    cleanupChannel(channel);
    const list = signalStore.get(channel) || [];
    const newSignals = list.filter((item) => item.ts > since);

    return { success: true, signals: newSignals, serverTime: Date.now() };
  }

  return { success: false, error: "Method not allowed" };
});
