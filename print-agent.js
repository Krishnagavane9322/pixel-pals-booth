import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';

const PORT = 3100;
const VERCEL_URL = process.env.VERCEL_URL || 'https://pixel-pals-booth.vercel.app';
const CHANNEL = process.env.BOOTH_CHANNEL || 'rovi-booth-default';

let lastHandledPrintTs = 0;

// Helper to spool base64 image data to Windows printer DS-RX1
async function printJob(dataUrl, printerName = 'DS-RX1') {
  return new Promise((resolve, reject) => {
    try {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const tmpPhotosDir = path.join(os.tmpdir(), 'photos');
      if (!fs.existsSync(tmpPhotosDir)) fs.mkdirSync(tmpPhotosDir, { recursive: true });

      const printFile = path.join(tmpPhotosDir, `rovi_local_print_${Date.now()}.jpg`);
      fs.writeFileSync(printFile, imgBuffer);

      const safePrintFile = printFile.replace(/'/g, "''");
      const safePrinterName = printerName.replace(/'/g, "''");
      const psScriptPath = path.join(tmpPhotosDir, `print_agent_${Date.now()}.ps1`);

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

      fs.writeFileSync(psScriptPath, psScript, 'utf-8');
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath], (err) => {
        setTimeout(() => {
          try { fs.unlinkSync(psScriptPath); } catch {}
          try { fs.unlinkSync(printFile); } catch {}
        }, 10000);
        if (err) {
          reject(err);
        } else {
          console.log('[Print Agent] Spooled print job cleanly to DS-RX1!');
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Poll /api/session for print action, then fetch strip image from /api/strip by ID

async function fetchJson(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function pollForPrintJobs() {
  try {
    // 1. Check /api/session for a pending print action (include channel)
    const session = await fetchJson(`${VERCEL_URL}/api/session?channel=${encodeURIComponent(CHANNEL)}`);
    if (!session) return;

    const actionTs = session.actionTs || 0;
    const action = session.action;
    const stripId = session.stripId;

    if (action === 'print' && stripId && actionTs > lastHandledPrintTs) {
      lastHandledPrintTs = actionTs;
      console.log(`[Print Agent] Print action detected! Fetching strip ${stripId} from Vercel...`);

      // 2. Fetch the actual photo strip image by ID from /api/strip
      const stripRes = await fetchJson(`${VERCEL_URL}/api/strip?id=${encodeURIComponent(stripId)}`);

      if (stripRes && stripRes.success && stripRes.dataUrl) {
        console.log(`[Print Agent] Strip image fetched (${Math.round(stripRes.dataUrl.length / 1024)}KB). Spooling to DS-RX1...`);
        await printJob(stripRes.dataUrl, 'DS-RX1');
        console.log(`[Print Agent] ✅ Print job spooled successfully to DS-RX1!`);
      } else {
        console.warn(`[Print Agent] ❌ Strip ${stripId} not found on Vercel:`, stripRes?.error);
      }
    }
  } catch (err) {
    // Ignore transient network errors
  }
}

// Poll for print jobs every 1200ms
setInterval(pollForPrintJobs, 1200);


const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { dataUrl, printerName = 'DS-RX1' } = JSON.parse(body);
        if (!dataUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No dataUrl provided' }));
          return;
        }

        await printJob(dataUrl, printerName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Printed cleanly to DS-RX1' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`\n🖨️  ROVI Local Print Agent is active on http://localhost:${PORT}`);
  console.log(`   Connected printer: DS-RX1`);
  console.log(`   Cloud polling Vercel: ${VERCEL_URL}/api/print-queue`);
  console.log(`   Ready for Vercel cloud print requests!\n`);
});
