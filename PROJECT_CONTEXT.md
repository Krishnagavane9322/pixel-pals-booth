# ROVI AI Photo Booth Kiosk — Project Context & Architecture

> **Note for AI Assistant**: Read this file first when starting a session to get full context on architecture, components, data flows, and state synchronization without re-scanning the entire codebase.

---

## 1. Tech Stack Overview
- **Framework**: TanStack Start (SSR + Server Functions) with React 19 & Vite
- **Server Engine**: Nitro (`nitro/vite`) with `h3` v2
- **Styling & UI**: TailwindCSS, Framer Motion, Lucide Icons
- **Real-Time Messaging**: Self-hosted Server-Sent Events (SSE) — Zero external dependencies
- **Video Mirroring**: WebRTC peer-to-peer live camera stream + JPEG frame fallback over SSE
- **Storage**: In-memory server map (`stripStore`), Local Disk (`public/photos/`), and Vercel Blob (Cloud)

---

## 2. Directory Structure & Key Files

```
pixel-pals-booth/
├── server/
│   └── routes/
│       └── api/
│           └── sse.ts            # Nitro server handler (GET /api/sse?channel=...)
├── src/
│   ├── components/
│   │   ├── AdminPanel.tsx        # Kiosk settings modal (triple-tap top-left or Shift+A)
│   │   └── RobotFace.tsx         # Animated mascot component
│   ├── lib/
│   │   ├── sse-broker.server.ts  # In-memory pub/sub broker for SSE clients
│   │   ├── sse-client.ts         # useSSEChannel hook & ChannelBus event listener
│   │   ├── pusher.ts             # sendPusherEvent server function (publishes to SSE broker)
│   │   ├── server-storage.ts     # storeStripData, uploadPhoto, getStripData server functions
│   │   ├── booth-storage.ts      # Kiosk settings & localStorage strip history
│   │   ├── strip.ts              # Photo strip layout generator (Canvas 2D)
│   │   └── audio.ts              # Voice guidance & shutter sound triggers
│   └── routes/
│       ├── __root.tsx            # HTML shell & query client setup
│       ├── index.tsx             # Main Kiosk Laptop interface
│       ├── tablet.tsx            # Wireless Tablet Remote Control interface
│       └── photo.$id.tsx         # Public photo strip viewer (QR Code scan target)
├── PROJECT_CONTEXT.md            # This file
├── tsconfig.json                 # TypeScript config (includes src/ and server/)
└── vite.config.ts                # Vite config (registers Nitro SSE route)
```

---

## 3. Real-Time Communication System (Dual-Mode SSE + Fast HTTP Polling)

Built to work **100% seamlessly on both Localhost (persistent server) AND Vercel Serverless Functions**:

```
[Tablet Remote] <--- (Instant SSE or 450ms HTTP Polling) ---> [Server Engine] <--- (sendPusherEvent) ---> [Laptop Kiosk]
```

1. **`src/lib/sse-broker.server.ts`**:
   - Stores active SSE response writers AND maintains a rolling event history log per channel (`Map<string, ChannelEventRecord[]>`, 5-min TTL).
   - `publish(channel, event, data)` broadcasts to active SSE writers AND appends to the history log.
   - Exports `fetchChannelEvents` server function for fast polling clients.
2. **`server/routes/api/sse.ts`**:
   - Nitro server route returning `text/event-stream` for persistent connections.
3. **`src/lib/sse-client.ts`**:
   - `useSSEChannel(channel)` initializes `EventSource` for instant streaming on Localhost/persistent servers.
   - Simultaneously runs a lightweight 450ms HTTP polling fallback (`fetchChannelEvents`) so devices stay 100% synchronized even when deployed on Vercel Serverless where long-lived SSE connections and cross-lambda state are isolated.
   - Deduplicates incoming event IDs (`seenIds` set) to prevent double processing.
4. **`src/lib/pusher.ts`**:
   - `sendPusherEvent` server function that accepts `{ channel, event, data }` and calls `sseBroker.publish()`.

---

## 4. WebRTC Live Camera Mirroring

- When Kiosk enters `camera` mode:
  1. Laptop initializes WebRTC `RTCPeerConnection` with camera media track.
  2. Laptop sends `SDP_OFFER` over SSE.
  3. Tablet receives `SDP_OFFER`, creates `SDP_ANSWER`, and sends back over SSE.
  4. ICE candidates (`ICE_HOST`, `ICE_VIEWER`) exchange over SSE.
  5. Tablet receives remote stream and displays live camera in video element (`<video autoplay playsInline muted />`).
- **Fallback**: Laptop periodically captures compressed 320x240 JPEG snapshots (`CAMERA_FRAME`) sent over SSE if WebRTC peer connection is establishing or unavailable.

---

## 5. Photo Storage & Retrieval Flow

1. **Capture**: Laptop captures photos, composes photo strip using Canvas API (`buildStrip`).
2. **Local Storage**: Saved to browser `localStorage` via `saveStrip`.
3. **Server Memory**: Base64 dataUrl posted to `storeStripData` (`stripStore` map, 30-min TTL).
4. **Disk/Cloud Upload**: `uploadPhoto` saves image to `public/photos/${id}.jpg` or Vercel Blob.
5. **Tablet Sync**:
   - `PHOTO_READY` event sends base64 `dataUrl` (or Cloud URL) to tablet.
   - `loadStripForTablet` uses base64 dataUrl directly or falls back to `getStripData({ data: id })` server function.

---

## 6. Printing System

- **Layout**: 6x4 inch 300 DPI canvas (1800x1200 px) generating a landscape 2-strip print with a dashed cut line in the middle.
- **Printing Mechanism**:
  - `popup = window.open("", "_blank")` opens a clean print window.
  - HTML written with `@page { margin: 0; }` and automatic `window.print()` / `window.close()` script on image load.
  - Temporary hidden `<iframe>` fallback if browser blocks popups.
  - **No inline `@media print` or DOM elements injected into the main page**, ensuring zero visual glitches or layout corruption on Kiosk/Tablet screens.

---

## 7. Development & Maintenance Guidelines

- **Run Locally**: `npm run dev` (runs Vite dev server on port 3000 exposed on local network `host: true`).
- **Type Checking**: `npx tsc --noEmit --skipLibCheck`.
- **Git Workflow**: Commit and push to `origin main`. Local test photos (`public/photos/*`) are git-ignored.
- **Updating this File**: Update `PROJECT_CONTEXT.md` whenever key architectural components or data contracts change.
