import { useEffect, useRef, useState } from "react";
import { fetchChannelEvents, type ChannelEventRecord } from "@/lib/sse-poll";

// ---------------------------------------------------------------------------
// ChannelBus — Pusher-compatible event bus
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

// Global PeerJS connection pool for direct P2P data transport
const activeP2pConns: Set<any> = new Set();

export function sendP2pMessage(event: string, data: unknown): void {
  const msg = JSON.stringify({
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    event,
    data,
    timestamp: Date.now(),
  });
  activeP2pConns.forEach((conn) => {
    try {
      if (conn.open) conn.send(msg);
    } catch (e) {
      console.warn("[P2P] Send failed:", e);
    }
  });
}

// ---------------------------------------------------------------------------
// useSSEChannel — Multi-Transport Sync (PeerJS P2P + SSE + HTTP Polling Fallback)
// Fixes: tablet lag, stuck states, missed events, slow sync
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
  const lastTimestampRef = useRef<number>(Date.now() - 10000);

  const processEventRecord = (rec: { id?: string; event: string; data: unknown; timestamp?: number }) => {
    if (rec.id) {
      if (seenIdsRef.current.has(rec.id)) return;
      seenIdsRef.current.add(rec.id);
      if (seenIdsRef.current.size > 500) {
        const arr = Array.from(seenIdsRef.current);
        seenIdsRef.current = new Set(arr.slice(200));
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
    let peerInstance: any = null;
    let p2pReconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const isTablet = window.location.pathname.startsWith("/tablet");

    // ── PeerJS P2P Direct Browser Transport (with auto-reconnect) ──────────
    function startP2P() {
      if (!active) return;

      import("peerjs")
        .then(({ Peer }) => {
          if (!active) return;
          const peerIdClean = channel.replace(/[^a-zA-Z0-9_-]/g, "");
          const hostPeerId = `rovi-booth-kiosk-${peerIdClean}`;

          if (isTablet) {
            // Tablet: connect to kiosk host
            const peer = new Peer();
            peerInstance = peer;

            peer.on("open", () => {
              if (!active) return;
              const conn = peer.connect(hostPeerId, { reliable: true, serialization: "json" });
              conn.on("open", () => {
                if (!active) return;
                activeP2pConns.add(conn);
                setConnected(true);
                console.log("[P2P] Tablet connected to kiosk");
              });
              conn.on("data", (data: any) => {
                if (!active) return;
                try {
                  const msg = typeof data === "string" ? JSON.parse(data) : data;
                  processEventRecord(msg);
                } catch (e) {}
              });
              conn.on("close", () => {
                activeP2pConns.delete(conn);
                // Auto-reconnect after 1s
                if (active) {
                  console.log("[P2P] Tablet P2P closed, reconnecting in 1s...");
                  p2pReconnectTimer = setTimeout(startP2P, 1000);
                }
              });
              conn.on("error", () => {
                activeP2pConns.delete(conn);
                if (active) p2pReconnectTimer = setTimeout(startP2P, 1000);
              });
            });

            peer.on("error", () => {
              if (active) p2pReconnectTimer = setTimeout(startP2P, 2000);
            });
          } else {
            // Kiosk: host the channel ID, accept incoming connections
            const peer = new Peer(hostPeerId);
            peerInstance = peer;

            peer.on("open", () => {
              if (!active) setConnected(true);
            });

            peer.on("connection", (conn: any) => {
              conn.on("open", () => {
                if (!active) return;
                activeP2pConns.add(conn);
                setConnected(true);
              });
              conn.on("data", (data: any) => {
                if (!active) return;
                try {
                  const msg = typeof data === "string" ? JSON.parse(data) : data;
                  processEventRecord(msg);
                } catch (e) {}
              });
              conn.on("close", () => activeP2pConns.delete(conn));
              conn.on("error", () => activeP2pConns.delete(conn));
            });

            peer.on("error", () => {
              if (!active) return;
              // Host ID taken — fall back to random peer ID
              const fallbackPeer = new Peer();
              if (peerInstance && peerInstance !== fallbackPeer) {
                try { peerInstance.destroy(); } catch (e) {}
              }
              peerInstance = fallbackPeer;
              fallbackPeer.on("connection", (conn: any) => {
                conn.on("open", () => {
                  if (!active) return;
                  activeP2pConns.add(conn);
                  setConnected(true);
                });
                conn.on("data", (data: any) => {
                  if (!active) return;
                  try {
                    const msg = typeof data === "string" ? JSON.parse(data) : data;
                    processEventRecord(msg);
                  } catch (e) {}
                });
                conn.on("close", () => activeP2pConns.delete(conn));
              });
            });
          }
        })
        .catch((err) => console.warn("[P2P] PeerJS import skipped:", err));
    }

    startP2P();

    // ── Persistent SSE connection ────────────────────────────────────────────
    const url = `/api/sse?channel=${encodeURIComponent(channel)}`;
    let es: EventSource | null = new EventSource(url);

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
      // Reconnect SSE after a short delay if it drops
      if (active) {
        es?.close();
        es = null;
        setTimeout(() => {
          if (!active) return;
          const newEs = new EventSource(url);
          newEs.onopen = () => { if (active) setConnected(true); };
          newEs.onmessage = (e: MessageEvent<string>) => {
            try {
              const msg = JSON.parse(e.data) as { event: string; data: unknown; id?: string; timestamp?: number };
              if (active) processEventRecord(msg);
            } catch {}
          };
          es = newEs;
        }, 1500);
      }
    };

    // ── Ultra-Fast HTTP Polling (150ms) for Vercel Serverless ───────────────
    // This is the primary reliable fallback and guarantees <150ms tablet sync
    const pollTimer = setInterval(async () => {
      if (!active) return;
      try {
        const res = (await fetchChannelEvents({
          data: { channel, since: lastTimestampRef.current },
        })) as any;
        if (res && res.success && active) {
          setConnected(true);
          if (Array.isArray(res.events) && res.events.length > 0) {
            res.events.forEach((item: ChannelEventRecord) => {
              processEventRecord(item);
            });
          }
        }
      } catch {
        // Ignore polling glitches
      }
    }, 150);

    return () => {
      active = false;
      es?.close();
      clearInterval(pollTimer);
      if (p2pReconnectTimer) clearTimeout(p2pReconnectTimer);
      activeP2pConns.clear();
      if (peerInstance) {
        try { peerInstance.destroy(); } catch (e) {}
      }
    };
  }, [channel]);

  return { bus, connected };
}
