// Server-only SSE pub/sub broker
// Each active SSE connection registers a write function here.
// When sendPusherEvent() is called, publish() fans the message out to all
// connected clients on that channel.

type Writer = (chunk: string) => void;

// Survive HMR reloads in Vite dev by storing on globalThis
const g = globalThis as Record<string, unknown>;
if (!g.__sseBrokerChannels) {
  g.__sseBrokerChannels = new Map<string, Set<Writer>>();
}
const channels = g.__sseBrokerChannels as Map<string, Set<Writer>>;

export function subscribe(channel: string, writer: Writer): void {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(writer);
}

export function unsubscribe(channel: string, writer: Writer): void {
  const writers = channels.get(channel);
  if (writers) {
    writers.delete(writer);
    if (writers.size === 0) channels.delete(channel);
  }
}

export function publish(channel: string, event: string, data: unknown): void {
  const writers = channels.get(channel);
  if (!writers || writers.size === 0) return;
  const msg = `data: ${JSON.stringify({ event, data })}\n\n`;
  for (const write of writers) {
    try {
      write(msg);
    } catch {
      // Writer may already be closed — safe to ignore
    }
  }
}
