// Server-only SSE pub/sub broker & event log for Vercel serverless + Localhost.
// Stores active SSE writers and an event history queue per channel so clients
// can sync via SSE on persistent servers or fast HTTP polling on Vercel Serverless.

import { createServerFn } from "@tanstack/react-start";

export type ChannelEventRecord = {
  id: string;
  event: string;
  data: any;
  timestamp: number;
};

type Writer = (chunk: string) => void;

// Survive HMR reloads in Vite dev & serverless lambda reuse by storing on globalThis
const g = globalThis as Record<string, unknown>;
if (!g.__sseBrokerChannels) {
  g.__sseBrokerChannels = new Map<string, Set<Writer>>();
}
if (!g.__sseBrokerHistory) {
  g.__sseBrokerHistory = new Map<string, ChannelEventRecord[]>();
}

const channels = g.__sseBrokerChannels as Map<string, Set<Writer>>;
const historyMap = g.__sseBrokerHistory as Map<string, ChannelEventRecord[]>;

export function subscribe(channel: string, writer: Writer): void {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(writer);
}

export function unsubscribe(channel: string, writer: Writer): void {
  const writers = channels.get(channel);
  if (writers) {
    writers.delete(writer);
    if (writers.size === 0) channels.delete(channel);
  }
}

export function publish(channel: string, event: string, data: unknown): void {
  const now = Date.now();
  const record: ChannelEventRecord = {
    id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
    event,
    data,
    timestamp: now,
  };

  // 1. Save to event history map for polling fallback (Vercel serverless)
  if (!historyMap.has(channel)) historyMap.set(channel, []);
  const list = historyMap.get(channel)!;
  list.push(record);

  // Keep max 100 events per channel & purge events older than 5 minutes
  const fiveMinAgo = now - 5 * 60 * 1000;
  while (list.length > 100 || (list.length > 0 && list[0].timestamp < fiveMinAgo)) {
    list.shift();
  }

  // 2. Broadcast to active SSE writers if connected (Localhost / Persistent servers)
  const writers = channels.get(channel);
  if (writers && writers.size > 0) {
    const msg = `data: ${JSON.stringify({ event, data, id: record.id, timestamp: now })}\n\n`;
    for (const write of writers) {
      try {
        write(msg);
      } catch {
        // Writer may be closed
      }
    }
  }
}

export function getEventsSince(channel: string, since: number): ChannelEventRecord[] {
  const list = historyMap.get(channel);
  if (!list || list.length === 0) return [];
  return list.filter((item) => item.timestamp > since);
}

// Server function for client HTTP polling fallback (works on Vercel Serverless)
export const fetchChannelEvents = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const payload = rawPayload?.data ?? rawPayload;
    const channel = payload?.channel ?? "default";
    const since = payload?.since ?? 0;
    return {
      success: true,
      events: getEventsSince(channel, since),
      serverTime: Date.now(),
    };
  });
