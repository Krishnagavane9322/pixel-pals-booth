// sse-poll.ts — Client-safe server function for HTTP polling fallback.
// This file is intentionally NOT named .server.ts so the client bundle can
// import the createServerFn stub. The handler uses a dynamic import so
// no static dependency on sse-broker.server.ts exists in the client bundle.
import { createServerFn } from "@tanstack/react-start";

export type { ChannelEventRecord } from "@/lib/sse-broker.server";

// Server function for client HTTP polling fallback (works on Vercel Serverless)
export const fetchChannelEvents = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (rawPayload: any) => {
    // Dynamic import keeps sse-broker.server.ts out of the client bundle graph
    const { getEventsSince } = await import("@/lib/sse-broker.server");
    let payload = rawPayload;
    while (payload && typeof payload === "object" && payload.data && !payload.channel) {
      payload = payload.data;
    }
    const channel = payload?.channel ?? "default";
    const since = payload?.since ?? 0;
    return {
      success: true,
      events: getEventsSince(channel, since),
      serverTime: Date.now(),
    };
  });
