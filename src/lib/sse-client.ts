import { useEffect, useRef, useState } from "react";
import { fetchChannelEvents, type ChannelEventRecord } from "@/lib/sse-broker.server";

// ---------------------------------------------------------------------------
// ChannelBus — Pusher-compatible event bus
// Provides the same .bind() / .unbind() / .unbind_all() interface as a Pusher
// channel object so existing callers work without modification.
// ---------------------------------------------------------------------------
export class ChannelBus {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private handlers: Map<string, Set<Function>> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  bind(event: string, handler: Function): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  unbind(event: string, handler?: Function): void {
    if (!handler) {
      this.handlers.delete(event);
      return;
    }
    this.handlers.get(event)?.delete(handler);
  }

  unbind_all(): void {
    this.handlers.clear();
  }

  dispatch(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        const res = h(data);
        if (res && typeof (res as Promise<unknown>).catch === "function") {
          (res as Promise<unknown>).catch((err: unknown) => {
            console.warn(`[ChannelBus] Async handler error for '${event}':`, err);
          });
        }
      } catch (err) {
        console.warn(`[ChannelBus] Handler error for '${event}':`, err);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// useSSEChannel — Hybrid SSE + Fast HTTP Polling for Vercel Serverless & Localhost
// ---------------------------------------------------------------------------
export function useSSEChannel(channel: string): {
  bus: ChannelBus;
  connected: boolean;
} {
  const [connected, setConnected] = useState(false);

  const busRef = useRef<ChannelBus | null>(null);
  if (!busRef.current) busRef.current = new ChannelBus();
  const bus = busRef.current;

  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastTimestampRef = useRef<number>(Date.now() - 5000);

  const processEventRecord = (rec: { id?: string; event: string; data: unknown; timestamp?: number }) => {
    if (rec.id) {
      if (seenIdsRef.current.has(rec.id)) return;
      seenIdsRef.current.add(rec.id);
      if (seenIdsRef.current.size > 250) {
        const arr = Array.from(seenIdsRef.current);
        seenIdsRef.current = new Set(arr.slice(100));
      }
    }
    if (rec.timestamp && rec.timestamp > lastTimestampRef.current) {
      lastTimestampRef.current = rec.timestamp;
    }
    if (rec.event === "__connected__") {
      setConnected(true);
      return;
    }
    bus.dispatch(rec.event, rec.data);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    let active = true;

    // 1. Try SSE connection (Instant delivery on Localhost / persistent server)
    const url = `/api/sse?channel=${encodeURIComponent(channel)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      if (active) setConnected(true);
    };

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { event: string; data: unknown; id?: string; timestamp?: number };
        if (active) {
          setConnected(true);
          processEventRecord(msg);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      // EventSource may fail on Vercel Serverless due to lambda response limits
      // Fast Polling below guarantees seamless syncing
    };

    // 2. Fast HTTP Polling fallback loop (450ms) for Vercel Serverless compatibility
    const pollTimer = setInterval(async () => {
      if (!active) return;
      try {
        const res = (await fetchChannelEvents({
          data: { channel, since: lastTimestampRef.current },
        })) as any;
        if (res && res.success && active) {
          setConnected(true);
          if (Array.isArray(res.events)) {
            res.events.forEach((item: ChannelEventRecord) => {
              processEventRecord(item);
            });
          }
        }
      } catch {
        // Ignore polling glitches
      }
    }, 450);

    return () => {
      active = false;
      es.close();
      clearInterval(pollTimer);
    };
  }, [channel]);

  return { bus, connected };
}
