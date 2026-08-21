// service-install.js — Installs ROVI Print Agent as a Native Windows System Service
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceName = "ROVIPrintService";
const displayName = "ROVI Photo Booth Print Engine";
const description = "Background print spooler service for ROVI Photo Booth DNP DS-RX1 printer.";
const scriptPath = path.join(__dirname, "print-agent.js");

console.log("=================================================");
console.log("  Installing ROVI Print Engine Windows Service   ");
console.log("=================================================");

try {
  // Use PowerShell to register native Windows Service
  const psScript = `
    $serviceName = "${serviceName}"
    $displayName = "${displayName}"
    $binPath = "node.exe \\"${scriptPath.replace(/\\/g, "\\\\")}\\""
    
    $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName
        Start-Sleep -Seconds 2
    }
    
    New-Service -Name $serviceName -DisplayName $displayName -BinaryPathName $binPath -StartupType Automatic -Description "${description}"
    Start-Service -Name $serviceName
  `;

  const tmpPs = path.join(__dirname, "_install_svc.ps1");
  fs.writeFileSync(tmpPs, psScript, "utf-8");

  execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, { stdio: "inherit" });
  try { fs.unlinkSync(tmpPs); } catch {}

  console.log("\n[SUCCESS] ROVI Print Engine is installed & active as a Windows Background Service!");
} catch (err) {
  console.error("\n[ERROR] Service installation failed:", err.message);
  process.exit(1);
}
