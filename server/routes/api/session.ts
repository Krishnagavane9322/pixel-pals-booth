// /api/session — Tiny kiosk state store for cross-lambda polling on Vercel.
//
// The SSE broker uses in-memory globalThis which breaks on Vercel Serverless
// because each request hits a different lambda. This endpoint solves the
// problem by:
//   POST: kiosk writes its current screen state + stripId here
//   GET:  tablet polls here every 1s to know when to fetch the strip
//
// State is kept in globalThis (survives warm lambda reuse) AND in a tiny
// JSON file under /tmp so a cold lambda can also read recent state via disk.

import { defineHandler } from "h3";
import fs from "fs";
import path from "path";
import os from "os";

type SessionState = {
  channel: string;
  screen: "welcome" | "camera" | "processing" | "preview";
  stripId: string | null;
  ts: number;
};

// In-memory store — survives lambda reuse (warm starts)
const g = globalThis as any;
if (!g.__sessionStore) g.__sessionStore = new Map<string, SessionState>();
const sessionStore: Map<string, SessionState> = g.__sessionStore;

function sessionFilePath(channel: string): string {
  const safe = channel.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(os.tmpdir(), `rovi-session-${safe}.json`);
}

function readSessionFromDisk(channel: string): SessionState | null {
  try {
    const fp = sessionFilePath(channel);
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, "utf-8");
    const parsed = JSON.parse(raw) as SessionState;
    // Ignore stale disk sessions older than 30 minutes
    if (Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionToDisk(state: SessionState) {
  try {
    fs.writeFileSync(sessionFilePath(state.channel), JSON.stringify(state), "utf-8");
  } catch {
    // Read-only fs on some environments — ignore
  }
}

export default defineHandler(async (event) => {
  const method = event.req.method ?? "GET";
  const url = new URL(event.req.url);
  const channel = url.searchParams.get("channel") ?? "default";

  if (method === "POST") {
    let body: Partial<SessionState> = {};
    try {
      const text = await new Response(event.req.body as any).text();
      body = JSON.parse(text);
    } catch {
      return Response.json({ success: false, error: "Bad JSON" }, { status: 400 });
    }

    const state: SessionState = {
      channel,
      screen: body.screen ?? "welcome",
      stripId: body.stripId ?? null,
      ts: Date.now(),
    };

    sessionStore.set(channel, state);
    writeSessionToDisk(state);

    return Response.json({ success: true });
  }

  if (method === "GET") {
    // 1. Check warm-lambda in-memory store
    let state = sessionStore.get(channel);

    // 2. Fall back to disk (cold-start lambda)
    if (!state) {
      state = readSessionFromDisk(channel) ?? undefined;
      if (state) sessionStore.set(channel, state); // re-hydrate memory
    }

    if (!state) {
      return Response.json({ success: true, screen: "welcome", stripId: null, ts: 0 });
    }

    return Response.json({ success: true, ...state });
  }

  return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
});
