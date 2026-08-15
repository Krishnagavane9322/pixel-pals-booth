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
    watch: {
      ignored: ["**/public/photos/**"],
    },
  },
  nitro: {
    // Register the SSE streaming endpoint as a Nitro server handler
    handlers: [
      {
        route: "/api/sse",
        handler: "./server/routes/api/sse.ts",
        method: "GET",
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
