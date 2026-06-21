import Pusher from "pusher";
import { createServerFn } from "@tanstack/react-start";

let pusherInstance: Pusher | null = null;

function getPusherServer() {
  if (pusherInstance) return pusherInstance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.VITE_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.VITE_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    console.warn("Pusher server environment variables are not fully configured.");
    return null;
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherInstance;
}

// Server function to trigger/broadcast a Pusher event from client-side UI
export const sendPusherEvent = createServerFn({ method: "POST" })
  .validator((d: { channel: string; event: string; data: any }) => d)
  .handler(async ({ data }) => {
    const pusher = getPusherServer();
    if (!pusher) {
      return { success: false, error: "Pusher server not initialized or configured in env." };
    }

    try {
      await pusher.trigger(data.channel, data.event, data.data);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to trigger Pusher event:", err);
      return { success: false, error: err.message || "Unknown error" };
    }
  });
