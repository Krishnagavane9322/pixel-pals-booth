import { createServerFn } from "@tanstack/react-start";
import { publish } from "@/lib/sse-broker.server";

// Robust sendPusherEvent server function. Handles raw payloads or wrapped { data: ... }
// transparently so it works identically on Localhost and Vercel production serverless.
export const sendPusherEvent = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    const payload = rawPayload?.data ?? rawPayload;
    if (payload && payload.channel && payload.event) {
      publish(payload.channel, payload.event, payload.data);
    }
    return { success: true };
  });
