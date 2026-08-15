import { createServerFn } from "@tanstack/react-start";
import { sendP2pMessage } from "@/lib/sse-client";

// Robust payload unwrapper helper: handles single, double, or deeply nested { data: ... } wrappers
function unwrapPayload(raw: any): { channel?: string; event?: string; data?: any } {
  let p = raw;
  while (p && typeof p === "object" && p.data && !p.channel && !p.event) {
    p = p.data;
  }
  return p || {};
}

const sendPusherServerFn = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const { publish } = await import("@/lib/sse-broker.server");
    const payload = unwrapPayload(rawPayload);
    if (payload.channel && payload.event) {
      publish(payload.channel, payload.event, payload.data);
    } else {
      console.warn("[Pusher Server] Unhandled payload missing channel/event:", rawPayload);
    }
    return { success: true };
  });

// Multi-transport sendPusherEvent:
// Transmits instantly over P2P DataChannel on client + invokes server function
export async function sendPusherEvent(rawPayload: any): Promise<{ success: boolean }> {
  const payload = unwrapPayload(rawPayload);
  if (typeof window !== "undefined" && payload.event) {
    sendP2pMessage(payload.event, payload.data);
  }
  try {
    return await sendPusherServerFn({ data: payload });
  } catch (err) {
    console.warn("[Pusher] ServerFn call fallback:", err);
    return { success: true };
  }
}
