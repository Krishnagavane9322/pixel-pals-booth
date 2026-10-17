// install-service.js — Registers ROVI Print Agent as a permanent Windows Service
// Run ONCE as Administrator: node install-service.js
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Service } = require("node-windows");

const svc = new Service({
  name: "ROVI Photo Booth Print Agent",
  description:
    "Automatically spools photo strip print jobs from cloud to DNP DS-RX1 printer. Starts on boot.",
  script: path.join(__dirname, "print-agent.js"),
  nodeOptions: [],
  env: [
    { name: "VERCEL_URL", value: process.env.VERCEL_URL || "https://pixel-pals-booth.vercel.app" },
    { name: "BOOTH_CHANNEL", value: process.env.BOOTH_CHANNEL || "rovi-booth-default" },
  ],
});

svc.on("install", () => {
  console.log("\n✅ ROVI Print Agent Windows Service installed successfully!");
  console.log("   Starting service now...");
  svc.start();
});

svc.on("start", () => {
  console.log("✅ ROVI Print Agent Service is now RUNNING!");
  console.log("   It will auto-start every time this PC boots.");
  console.log("   Clients never need to do anything manually.\n");
});

svc.on("error", (err) => {
  console.error("❌ Service error:", err);
});

svc.on("alreadyinstalled", () => {
  console.log("ℹ️  Service already installed. Restarting to apply latest updates...");
  svc.stop();
  setTimeout(() => svc.start(), 2000);
});

console.log("Installing ROVI Print Agent as a permanent Windows Service...");
svc.install();
