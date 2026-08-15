import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// ChannelBus — Pusher-compatible event bus
// Provides the same .bind() / .unbind() / .unbind_all() interface as a Pusher
// channel object so existing callers (CameraScreen WebRTC code, etc.) work
// without modification.
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
// useSSEChannel — subscribe to /api/sse?channel=<channel>
// Returns a stable ChannelBus and a boolean `connected` flag.
// EventSource auto-reconnects on drop, so no manual retry needed.
// ---------------------------------------------------------------------------
export function useSSEChannel(channel: string): {
  bus: ChannelBus;
  connected: boolean;
} {
  const [connected, setConnected] = useState(false);

  // Stable bus reference — never recreated (same object for the component's
  // lifetime), so callers can safely bind/unbind outside effects.
  const busRef = useRef<ChannelBus | null>(null);
  if (!busRef.current) busRef.current = new ChannelBus();
  const bus = busRef.current;

  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard

    const url = `/api/sse?channel=${encodeURIComponent(channel)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);

    es.onerror = () => {
      setConnected(false);
      // EventSource will auto-reconnect; no manual action needed
    };

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { event: string; data: unknown };
        if (msg.event === "__connected__") {
          setConnected(true);
          return;
        }
        bus.dispatch(msg.event, msg.data);
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [channel, bus]);

  return { bus, connected };
}
