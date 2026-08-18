import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';

const PORT = 3100;

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
            if ($p -eq $targetPrinter -or $p -like "*$targetPrinter*" -or $p -like "*DS-RX1*" -or $p -like "*RX1*") {
                $foundPrinter = $p
                break
            }
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
                    $e.Graphics.DrawImage($srcImg, $e.PageBounds)
                })
                $pd.Print()
                $srcImg.Dispose()
            } else {
                $bmp = New-Object System.Drawing.Bitmap(1800, 1200)
                $g = [System.Drawing.Graphics]::FromImage($bmp)
                $g.Clear([System.Drawing.Color]::White)
                
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
                    $e.Graphics.DrawImage($bmp, $e.PageBounds)
                })
                $pd.Print()
                $bmp.Dispose()
                $srcImg.Dispose()
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
          }, 3000);
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          } else {
            console.log('[Print Agent] Spooled print job cleanly to DS-RX1!');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Printed cleanly to DS-RX1' }));
          }
        });
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
  console.log(`   Listening for print jobs from Vercel cloud app!\n`);
});
