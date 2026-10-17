// Nitro v3 server route: GET /api/sse?channel=<name>
// Uses h3 v2's defineHandler which receives an H3Event wrapping the Web Fetch Request.
// Nitro automatically picks up files from server/routes/**

import { defineHandler } from "h3";
import { subscribe, unsubscribe } from "../../../src/lib/sse-broker.server";

export default defineHandler(async (event) => {
  const url = new URL(event.req.url);
  const channel = url.searchParams.get("channel") ?? "default";

  const encoder = new TextEncoder();
  let writeChunk: ((chunk: string) => void) | null = null;
  let unsubscribed = false;

  const cleanup = () => {
    if (!unsubscribed && writeChunk) {
      unsubscribed = true;
      unsubscribe(channel, writeChunk);
      writeChunk = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      writeChunk = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      subscribe(channel, writeChunk);

      // Immediately confirm connection so the client sets connected = true
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: "__connected__", data: {} })}\n\n`),
      );
    },
    cancel() {
      cleanup();
    },
  });

  // Also clean up when the HTTP connection drops (abort signal)
  event.req.signal?.addEventListener("abort", cleanup, { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
