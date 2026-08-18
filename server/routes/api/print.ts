import { defineEventHandler, readBody } from "h3";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    return { success: false, error: "Method not allowed" };
  }

  try {
    const body = (await readBody(event)) as {
      id?: string;
      dataUrl?: string;
      printerName?: string;
      printLayout?: "2x6" | "4x6";
    };

    let { id, dataUrl, printerName = "DS-RX1", printLayout = "2x6" } = body || {};

    // 1. Locate photo strip base64 dataUrl if not provided in body
    if (!dataUrl && id) {
      const globalStore = (globalThis as any).__globalStripStore as Map<string, any> | undefined;
      const inMem = globalStore?.get(id);
      if (inMem?.dataUrl) {
        dataUrl = inMem.dataUrl;
      } else {
        const tmpPath = path.join(os.tmpdir(), "photos", `${id}.jpg`);
        const pubPath = path.join(process.cwd(), "public", "photos", `${id}.jpg`);
        const targetPath = fs.existsSync(pubPath) ? pubPath : (fs.existsSync(tmpPath) ? tmpPath : null);
        if (targetPath) {
          const buf = fs.readFileSync(targetPath);
          dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      }
    }

    if (!dataUrl) {
      return { success: false, error: "No photo strip image found to print" };
    }

    // 2. Extract base64 image data and save temporary file
    const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const imgBuffer = Buffer.from(base64Data, "base64");

    const tmpPhotosDir = path.join(os.tmpdir(), "photos");
    if (!fs.existsSync(tmpPhotosDir)) {
      fs.mkdirSync(tmpPhotosDir, { recursive: true });
    }

    const printFile = path.join(tmpPhotosDir, `rovi_print_${id || Date.now()}.jpg`);
    await fs.promises.writeFile(printFile, imgBuffer);

    // 3. Native Windows direct background printing via PowerShell .NET PrintDocument
    if (process.platform === "win32") {
      const psScriptPath = path.join(tmpPhotosDir, `print_${Date.now()}.ps1`);
      const safePrintFile = printFile.replace(/'/g, "''");
      const safePrinterName = printerName.replace(/'/g, "''");

      const psScript = `
Add-Type -AssemblyName System.Drawing
$filePath = '${safePrintFile}'
$targetPrinter = '${safePrinterName}'

if (Test-Path $filePath) {
    $img = [System.Drawing.Image]::FromFile($filePath)
    $pd = New-Object System.Drawing.Printing.PrintDocument
    
    # Check if target printer exists, else fallback to default system printer
    $installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
    if ($installed -contains $targetPrinter) {
        $pd.PrinterSettings.PrinterName = $targetPrinter
    }
    
    $pd.DefaultPageSettings.Landscape = $true
    $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    
    $pd.add_PrintPage({
        param($sender, $e)
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $e.Graphics.DrawImage($img, $e.PageBounds)
    })
    
    $pd.Print()
    $img.Dispose()
}
`;

      await fs.promises.writeFile(psScriptPath, psScript, "utf-8");

      return new Promise((resolve) => {
        execFile(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScriptPath],
          (error) => {
            // Clean up temporary script and image file after sending to spooler
            setTimeout(() => {
              try { fs.unlinkSync(psScriptPath); } catch {}
              try { fs.unlinkSync(printFile); } catch {}
            }, 3000);

            if (error) {
              console.warn("[Server Print] Native Windows printing warning:", error);
              resolve({ success: false, mode: "fallback", error: error.message });
            } else {
              console.log("[Server Print] Native direct print sent cleanly to printer!");
              resolve({ success: true, mode: "direct", printer: printerName });
            }
          }
        );
      });
    }

    return { success: true, mode: "fallback" };
  } catch (err: any) {
    console.error("[Server Print] Error:", err);
    return { success: false, error: err?.message };
  }
});
