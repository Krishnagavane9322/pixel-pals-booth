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
        $srcImg = [System.Drawing.Image]::FromFile($filePath)
        
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
            $pd.DefaultPageSettings.Landscape = $true
            $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
            
            $isLandscape = $srcImg.Width -gt $srcImg.Height
            
            if ($isLandscape) {
                $pd.add_PrintPage({
                    param($sender, $e)
                    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $rect = New-Object System.Drawing.Rectangle(0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
                    $e.Graphics.DrawImage($srcImg, $rect)
                })
                $pd.add_EndPrint({
                    param($sender, $e)
                    if ($srcImg) { $srcImg.Dispose() }
                })
                $pd.Print()
            } else {
                $bmp = New-Object System.Drawing.Bitmap(1800, 1200)
                $g = [System.Drawing.Graphics]::FromImage($bmp)
                $g.Clear([System.Drawing.Color]::White)
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                
                $g.TranslateTransform(0, 1200)
                $g.RotateTransform(-90)
                $g.DrawImage($srcImg, 0, 0, 1200, 900)
                $g.ResetTransform()
                
                $g.TranslateTransform(900, 1200)
                $g.RotateTransform(-90)
                $g.DrawImage($srcImg, 0, 0, 1200, 900)
                $g.ResetTransform()
                
                $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::LightGray, 3)
                $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
                $g.DrawLine($pen, 900, 0, 900, 1200)
                $pen.Dispose()
                $g.Dispose()
                
                $pd.add_PrintPage({
                    param($sender, $e)
                    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $rect = New-Object System.Drawing.Rectangle(0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
                    $e.Graphics.DrawImage($bmp, $rect)
                })
                $pd.add_EndPrint({
                    param($sender, $e)
                    if ($bmp) { $bmp.Dispose() }
                    if ($srcImg) { $srcImg.Dispose() }
                })
                $pd.Print()
            }
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
              try { fs.unlinkSync(psScriptPath); } catch {}
              try { fs.unlinkSync(printFile); } catch {}
            }, 5000);

            if (error) {
              console.warn("[Server Print] Native Windows printing error:", error, stderr);
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
