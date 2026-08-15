import { createServerFn } from "@tanstack/react-start";
import { publish } from "@/lib/sse-broker.server";
import { sendP2pMessage } from "@/lib/sse-client";

const sendPusherServerFn = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const payload = rawPayload?.data ?? rawPayload;
    if (payload && payload.channel && payload.event) {
      publish(payload.channel, payload.event, payload.data);
    }
    return { success: true };
  });

// Multi-transport sendPusherEvent:
// Transmits instantly over P2P DataChannel on client + invokes server function
export async function sendPusherEvent(rawPayload: any): Promise<{ success: boolean }> {
  const payload = rawPayload?.data ?? rawPayload;
  if (typeof window !== "undefined" && payload && payload.event) {
    sendP2pMessage(payload.event, payload.data);
  }
  try {
    return await sendPusherServerFn({ data: rawPayload });
  } catch (err) {
    console.warn("[Pusher] ServerFn call fallback:", err);
    return { success: true };
  }
}
