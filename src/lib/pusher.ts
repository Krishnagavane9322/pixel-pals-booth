import { createServerFn } from "@tanstack/react-start";
import { publish } from "@/lib/sse-broker.server";

// Drop-in replacement for the old Pusher-based sendPusherEvent.
// All callers in index.tsx and tablet.tsx remain unchanged.
export const sendPusherEvent = createServerFn({ method: "POST" })
  .validator((d: { channel: string; event: string; data: unknown }) => d)
  .handler(async ({ data }) => {
    publish(data.channel, data.event, data.data);
    return { success: true };
  });
