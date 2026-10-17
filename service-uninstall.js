// service-uninstall.js — Uninstalls ROVI Print Engine Windows Service
import { execSync } from "child_process";

const serviceName = "ROVIPrintService";

console.log("=================================================");
console.log(" Uninstalling ROVI Print Engine Windows Service ");
console.log("=================================================");

try {
  const psScript = `
    $serviceName = "${serviceName}"
    $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName
        Write-Host "Service $serviceName uninstalled successfully."
    }
  `;

  execSync(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, " ")}"`,
    { stdio: "inherit" },
  );
  console.log("\n[SUCCESS] ROVI Print Engine service uninstalled cleanly.");
} catch (err) {
  console.error("\n[WARNING] Service uninstall error:", err.message);
}
