// Utility for generating composite photo sheets (e.g. 2x6 double strip on 4x6 paper)
// and triggering reliable browser printing via an isolated iframe.

export interface PrintSheetResult {
  sheetDataUrl: string;
  isDoubleStrip: boolean;
  width: number;
  height: number;
}

/**
 * Loads an image from a data URL or image path into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Failed to load image for print sheet: " + e));
    img.src = src;
  });
}

/**
 * Prepares the final printable sheet.
 * For 2x6 layout, photo booth printers (and standard 4x6 photo paper) print two
 * identical 2x6 strips side-by-side with a dashed cut line in the middle.
 * For 4x6 layout, returns the landscape 4x6 sheet directly.
 */
export async function preparePrintSheet(
  stripDataUrl: string,
  layout: "2x6" | "4x6" = "2x6",
): Promise<PrintSheetResult> {
  if (layout === "4x6") {
    return {
      sheetDataUrl: stripDataUrl,
      isDoubleStrip: false,
      width: 1800,
      height: 1200,
    };
  }

  // 2x6 Layout: Compose two 600x1800 strips onto a 1200x1800 (4x6" @ 300 DPI) sheet
  try {
    const img = await loadImage(stripDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) {
      return { sheetDataUrl: stripDataUrl, isDoubleStrip: false, width: 600, height: 1800 };
    }

    // High quality smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1200, 1800);

    // Draw Left Copy (0 to 600)
    ctx.drawImage(img, 0, 0, 600, 1800);

    // Draw Right Copy (600 to 1200)
    ctx.drawImage(img, 600, 0, 600, 1800);

    // Subtle dashed cut line down the center
    ctx.save();
    ctx.setLineDash([16, 12]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(180, 180, 180, 0.75)";
    ctx.beginPath();
    ctx.moveTo(600, 0);
    ctx.lineTo(600, 1800);
    ctx.stroke();

    // Subtle scissor cut markers at top and bottom
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(150, 150, 150, 0.8)";
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✂ CUT", 600, 30);
    ctx.fillText("✂ CUT", 600, 1770);
    ctx.restore();

    const sheetDataUrl = canvas.toDataURL("image/jpeg", 0.96);
    return {
      sheetDataUrl,
      isDoubleStrip: true,
      width: 1200,
      height: 1800,
    };
  } catch (err) {
    console.warn(
      "[Print Sheet] Failed to compose double-strip, falling back to original strip:",
      err,
    );
    return {
      sheetDataUrl: stripDataUrl,
      isDoubleStrip: false,
      width: 600,
      height: 1800,
    };
  }
}

/**
 * Triggers browser printing via an isolated hidden iframe.
 * Ensures the main website UI is not altered, no dark backgrounds or buttons are printed,
 * and high-resolution margins are respected across all desktop and mobile browsers.
 */
export function printViaBrowser(
  sheetDataUrl: string,
  options: { copies?: number; layout?: "2x6" | "4x6"; title?: string } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const copies = Math.max(1, Math.min(10, options.copies || 1));
    const title = options.title || "ROVI Photo Strip Print";

    // Clean up any stale print frames
    const oldFrames = document.querySelectorAll(".rovi-print-frame");
    oldFrames.forEach((el) => el.remove());

    const iframe = document.createElement("iframe");
    iframe.className = "rovi-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      console.warn("[Print] Could not access iframe content window");
      // Fallback: window.open
      openPrintWindowFallback(sheetDataUrl, copies);
      resolve(true);
      return;
    }

    // Build pages for copies
    let pagesHtml = "";
    for (let i = 0; i < copies; i++) {
      pagesHtml += `
        <div class="print-page ${i === copies - 1 ? "last-page" : ""}">
          <img src="${sheetDataUrl}" class="print-img" alt="Photo Print" />
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            width: 100%;
            height: 100%;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-page {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            page-break-after: always;
            page-break-inside: avoid;
            background: #ffffff;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          .last-page {
            page-break-after: auto;
          }
          .print-img {
            max-width: 100%;
            max-height: 100%;
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Wait for images to load before triggering window.print()
    const imgs = doc.querySelectorAll("img");
    let loadedCount = 0;
    const totalImgs = imgs.length;

    const triggerPrint = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (e) {
          console.warn("[Print] iframe.print failed, trying window fallback:", e);
          openPrintWindowFallback(sheetDataUrl, copies);
          resolve(true);
        }

        // Clean up iframe after 30 seconds
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {}
        }, 30000);
      }, 250);
    };

    if (totalImgs === 0) {
      triggerPrint();
    } else {
      imgs.forEach((img) => {
        if (img.complete) {
          loadedCount++;
          if (loadedCount >= totalImgs) triggerPrint();
        } else {
          img.onload = () => {
            loadedCount++;
            if (loadedCount >= totalImgs) triggerPrint();
          };
          img.onerror = () => {
            loadedCount++;
            if (loadedCount >= totalImgs) triggerPrint();
          };
        }
      });
    }
  });
}

/**
 * Fallback print mechanism if iframe is blocked by browser restrictions.
 */
function openPrintWindowFallback(dataUrl: string, copies: number = 1) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    // If popups are completely blocked, alert or direct print
    return;
  }
  let pages = "";
  for (let i = 0; i < copies; i++) {
    pages += `<div style="page-break-after:${i === copies - 1 ? "auto" : "always"};height:100vh;display:flex;align-items:center;justify-content:center;"><img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`;
  }
  win.document.write(`
    <!DOCTYPE html><html><head><title>Print Photo Strip</title>
    <style>@page{size:auto;margin:0;}html,body{margin:0;padding:0;background:#fff;}</style>
    </head><body>${pages}
    <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},300);};</script>
    </body></html>
  `);
  win.document.close();
}
