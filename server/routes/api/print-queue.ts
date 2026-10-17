import { defineEventHandler, getQuery, readBody } from "h3";

declare global {
  var __printJobQueue: Array<{
    id: string;
    dataUrl: string;
    printerName: string;
    printLayout: string;
    ts: number;
  }>;
  var __lastPoppedPrintTs: number;
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const since = Number(query.since) || globalThis.__lastPoppedPrintTs || 0;

    const queue = globalThis.__printJobQueue || [];
    const pendingJobs = queue.filter((j) => j.ts > since);

    if (pendingJobs.length > 0) {
      globalThis.__lastPoppedPrintTs = pendingJobs[pendingJobs.length - 1].ts;
    }

    return {
      success: true,
      jobs: pendingJobs,
      latestTs: globalThis.__lastPoppedPrintTs || Date.now(),
    };
  }

  if (method === "POST") {
    const body = (await readBody(event)) as any;
    if (body?.action === "clear") {
      globalThis.__printJobQueue = [];
      return { success: true, message: "Queue cleared" };
    }
  }

  return { success: false, error: "Method not supported" };
});
