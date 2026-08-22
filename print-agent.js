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
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function downloadImageAsDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const b64 = buffer.toString('base64');
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch (err) {
    console.warn('[Print Agent] Download image error:', err.message);
    return null;
  }
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
      console.log(`[Print Agent] Print action detected for strip ${stripId}!`);

      let targetDataUrl = session.stripDataUrl || null;

      if (!targetDataUrl) {
        // Fallback: Fetch strip info from /api/strip
        const stripRes = await fetchJson(`${VERCEL_URL}/api/strip?id=${encodeURIComponent(stripId)}`);
        if (stripRes && stripRes.success) {
          if (stripRes.blobUrl) {
            console.log(`[Print Agent] Downloading from Blob URL: ${stripRes.blobUrl}`);
            targetDataUrl = await downloadImageAsDataUrl(stripRes.blobUrl);
          } else if (stripRes.dataUrl) {
            targetDataUrl = stripRes.dataUrl;
          }
        }
      }

      if (targetDataUrl) {
        console.log(`[Print Agent] Spooling photo strip (${Math.round(targetDataUrl.length / 1024)}KB) to DS-RX1...`);
        await printJob(targetDataUrl, 'DS-RX1');
        console.log(`[Print Agent] ✅ Photo strip spooled successfully to DS-RX1!`);
      } else {
        console.warn(`[Print Agent] ❌ Photo strip ${stripId} could not be retrieved from session or API.`);
      }
    }
  } catch (err) {
    console.warn(`[Print Agent] Poll error:`, err.message);
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
