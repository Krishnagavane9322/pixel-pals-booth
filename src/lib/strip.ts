import type { Settings } from "./booth-storage";

// 2x6 inch canvas at 300 DPI = 600x1800px
// Layout: The canvas itself is a true 2x6 strip.
// DNP RX1 prints this and cuts at the 2" mark.
export const STRIP_W = 600;   // 2" @ 300dpi
export const STRIP_H = 1800;   // 6" @ 300dpi

export async function buildStrip(
  photos: string[],
  settings: Settings,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d")!;

  // ── Dark strip background ──
  const grad = ctx.createLinearGradient(0, 0, STRIP_W, STRIP_H);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#1a0b2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // ── Photos: 3 stacked ──
  const footerH = 200;
  const photosAreaH = STRIP_H - footerH;
  const photoH = Math.floor(photosAreaH / 3);

  const imgs = await Promise.all(photos.map(loadImg));

  for (let i = 0; i < 3; i++) {
    const y = i * photoH;
    // Draw cover-cropped photo into the column with zoom support
    drawCover(ctx, imgs[i], 0, y, STRIP_W, photoH, settings.photoZoom);

    // Separator line between photos
    if (i < 2) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, y + photoH - 2, STRIP_W, 4);
    }
  }

  // ── Footer ──
  const footerY = photosAreaH;
  ctx.fillStyle = "rgba(11,16,32,0.97)";
  ctx.fillRect(0, footerY, STRIP_W, footerH);

  // Neon gradient border at top of footer
  const footerGrad = ctx.createLinearGradient(0, 0, STRIP_W, 0);
  footerGrad.addColorStop(0, "#00f5ff");
  footerGrad.addColorStop(1, "#b44dff");
  ctx.fillStyle = footerGrad;
  ctx.fillRect(0, footerY, STRIP_W, 4);

  // Logo (centered in strip)
  if (settings.logoDataUrl) {
    try {
      const logo = await loadImg(settings.logoDataUrl);
      const lh = 70;
      const lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, (STRIP_W - lw) / 2, footerY + 12, lw, lh);
    } catch {}
  }

  ctx.textAlign = "center";
  const cx = STRIP_W / 2; // center of strip

  ctx.fillStyle = "#7ee7ff";
  ctx.font = "bold 36px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(settings.watermark || "ROVI AI Photo Booth", cx, footerY + footerH - 76);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(settings.eventName, cx, footerY + footerH - 46);

  ctx.fillStyle = "#c9b8ff";
  ctx.font = "20px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(new Date().toLocaleString(), cx, footerY + footerH - 18);

  return canvas.toDataURL("image/jpeg", 0.94);
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  zoom: number = 1.0,
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }

  // Apply zoom factor by shrinking the source cropping rectangle from its center
  const currentZoom = zoom || 1.0;
  if (currentZoom > 1.0) {
    const zoomedSw = sw / currentZoom;
    const zoomedSh = sh / currentZoom;
    sx = sx + (sw - zoomedSw) / 2;
    sy = sy + (sh - zoomedSh) / 2;
    sw = zoomedSw;
    sh = zoomedSh;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function captureFromVideo(video: HTMLVideoElement, cssFilter?: string): string {
  const c = document.createElement("canvas");
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  // Capture full frame — no forced crop, let the strip layout handle aspect ratio
  c.width = vw;
  c.height = vh;
  const ctx = c.getContext("2d")!;
  // mirror horizontally (selfie view)
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  if (cssFilter) {
    ctx.filter = cssFilter;
  }
  ctx.drawImage(video, 0, 0, vw, vh);
  return c.toDataURL("image/jpeg", 0.94);
}

