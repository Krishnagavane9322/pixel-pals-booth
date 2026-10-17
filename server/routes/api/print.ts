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
      copies?: number;
    };

    let { id, dataUrl, printerName = "DS-RX1", printLayout = "2x6", copies = 1 } = body || {};

    // 1. Locate photo strip base64 dataUrl if not provided in body
    if (!dataUrl && id) {
      const globalStore = (globalThis as any).__globalStripStore as Map<string, any> | undefined;
      const inMem = globalStore?.get(id);
      if (inMem?.dataUrl) {
        dataUrl = inMem.dataUrl;
      } else {
        const tmpPath = path.join(os.tmpdir(), "photos", `${id}.jpg`);
        const pubPath = path.join(process.cwd(), "public", "photos", `${id}.jpg`);
        const targetPath = fs.existsSync(pubPath)
          ? pubPath
          : fs.existsSync(tmpPath)
            ? tmpPath
            : null;
        if (targetPath) {
          const buf = fs.readFileSync(targetPath);
          dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      }
    }

    if (!dataUrl) {
      return { success: false, error: "No photo strip image found to print" };
    }

    // Store print job in global queue so laptop print-agent can fetch it from Vercel deployment
    if (!(globalThis as any).__printJobQueue) {
      (globalThis as any).__printJobQueue = [];
    }
    const queue = (globalThis as any).__printJobQueue as Array<any>;
    queue.push({
      id: id || `print_${Date.now()}`,
      dataUrl,
      printerName,
      printLayout,
      ts: Date.now(),
    });
    if (queue.length > 20) queue.shift();

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
    try {
        $installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
        $foundPrinter = $null
        foreach ($p in $installed) {
            if ($p -eq $targetPrinter -or $p -like "*$targetPrinter*" -or $p -like "*DS-RX1*" -or $p -like "*RX1*" -or $p -like "*DNP*" -or $p -like "*Photo*") {
                $foundPrinter = $p
                break
            }
        }
        if (-not $foundPrinter) {
            try {
                $foundPrinter = (New-Object System.Drawing.Printing.PrintDocument).PrinterSettings.PrinterName
            } catch {}
        }
        
        if ($foundPrinter) {
            $pd = New-Object System.Drawing.Printing.PrintDocument
            $pd.PrinterSettings.PrinterName = $foundPrinter
            $pd.PrinterSettings.Copies = ${Math.max(1, Math.min(10, Number(copies) || 1))}
            $pd.DefaultPageSettings.Landscape = $true
            $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

            $pd.add_PrintPage({
                param($sender, $e)
                try {
                    $img = [System.Drawing.Image]::FromFile($filePath)
                    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

                    $w = $e.PageBounds.Width
                    $h = $e.PageBounds.Height

                    if ($img.Width -gt $img.Height) {
                        # Landscape photo strip -- draw to full 4x6 page
                        $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
                        $e.Graphics.DrawImage($img, $rect)
                    } else {
                        # Portrait photo strip -- draw 2 copies side-by-side (2x6 double strip on 4x6 paper)
                        $halfW = [int]($w / 2)

                        # Draw left copy
                        $leftRect = New-Object System.Drawing.Rectangle(0, 0, $halfW, $h)
                        $e.Graphics.DrawImage($img, $leftRect)

                        # Draw right copy
                        $rightRect = New-Object System.Drawing.Rectangle($halfW, 0, $halfW, $h)
                        $e.Graphics.DrawImage($img, $rightRect)

                        # Draw subtle dashed cut line in center
                        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::LightGray, 2)
                        $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
                        $e.Graphics.DrawLine($pen, $halfW, 0, $halfW, $h)
                        $pen.Dispose()
                    }
                    $img.Dispose()
                } catch {
                    Write-Error $_
                }
            })

            $pd.Print()
        }
    } catch {
        Write-Error $_
    }
}
`;

      await fs.promises.writeFile(psScriptPath, psScript, "utf-8");

      return new Promise((resolve) => {
        execFile(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScriptPath],
          (error, stdout, stderr) => {
            // Clean up temporary script and image file after sending to spooler
            setTimeout(() => {
              try {
                fs.unlinkSync(psScriptPath);
              } catch {}
              try {
                fs.unlinkSync(printFile);
              } catch {}
            }, 5000);

            if (error) {
              console.warn("[Server Print] Native Windows printing error:", error, stderr);
              resolve({ success: false, mode: "fallback", error: error.message });
            } else {
              console.log("[Server Print] Native direct print sent cleanly to printer!");
              resolve({ success: true, mode: "direct", printer: printerName });
            }
          },
        );
      });
    }

    return { success: true, mode: "fallback" };
  } catch (err: any) {
    console.error("[Server Print] Error:", err);
    return { success: false, error: err?.message };
  }
});
