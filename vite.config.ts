import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    host: true,  // Expose on local network so tablet can reach laptop's server
    port: 3000,
    hmr: {
      overlay: false, // Suppress intrusive overlay for transient TCP ECONNRESET socket disconnects
    },
    watch: {
      ignored: ["**/public/photos/**"],
    },
  },
  nitro: {
    // Register all API server handlers for Nitro engine in Vite dev & build
    handlers: [
      {
        route: "/api/sse",
        handler: "./server/routes/api/sse.ts",
      },
      {
        route: "/api/signal",
        handler: "./server/routes/api/signal.ts",
      },
      {
        route: "/api/frame",
        handler: "./server/routes/api/frame.ts",
      },
      {
        route: "/api/session",
        handler: "./server/routes/api/session.ts",
      },
      {
        route: "/api/strip",
        handler: "./server/routes/api/strip.ts",
      },
    ],
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro(),
    react(),
  ],
});
