// /api/session — Tiny kiosk state store for cross-lambda polling on Vercel.
// Uses official h3 readBody and getQuery helpers for Nitro / Vercel.

import { defineEventHandler, getQuery, readBody } from "h3";
import fs from "fs";
import path from "path";
import os from "os";

type SessionState = {
  channel: string;
  screen: "welcome" | "camera" | "processing" | "preview";
  stripId: string | null;
  ts: number;
};

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
    // Read-only fs fallback
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method;
  const query = getQuery(event);
  const channel = String(query.channel || "default");

  if (method === "POST") {
    try {
      const body = (await readBody(event)) as Partial<SessionState>;
      const state: SessionState = {
        channel,
        screen: body?.screen ?? "welcome",
        stripId: body?.stripId ?? null,
        ts: Date.now(),
      };

      sessionStore.set(channel, state);
      writeSessionToDisk(state);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  if (method === "GET") {
    let state = sessionStore.get(channel);

    if (!state) {
      state = readSessionFromDisk(channel) ?? undefined;
      if (state) sessionStore.set(channel, state);
    }

    if (!state) {
      return { success: true, screen: "welcome", stripId: null, ts: 0 };
    }

    return { success: true, ...state };
  }

  return { success: false, error: "Method not allowed" };
});
