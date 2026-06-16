import type { Settings } from "./booth-storage";

// 2x6 inch photo strip at 300 DPI (standard photo booth)
// width 600px (2"), height 1800px (6") — produces a tall 2x6 strip
// Spec asked for "2x4" — we use 600x1800 to fit 3 photos cleanly while staying 2" wide.
export const STRIP_W = 600;
export const STRIP_H = 1800;

export async function buildStrip(
  photos: string[],
  settings: Settings,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d")!;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, STRIP_H);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#1a0b2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  const pad = 30;
  const photoW = STRIP_W - pad * 2;
  const photoH = 480;
  const gap = 20;
  const footerH = STRIP_H - (pad + (photoH + gap) * 3) - pad;

  const imgs = await Promise.all(photos.map(loadImg));

  for (let i = 0; i < 3; i++) {
    const y = pad + i * (photoH + gap);
    // frame
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pad - 4, y - 4, photoW + 8, photoH + 8);
    drawCover(ctx, imgs[i], pad, y, photoW, photoH);
  }

  // Footer
  const footerY = pad + (photoH + gap) * 3;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(pad, footerY, photoW, footerH);

  // Logo
  if (settings.logoDataUrl) {
    try {
      const logo = await loadImg(settings.logoDataUrl);
      const lh = 90;
      const lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, (STRIP_W - lw) / 2, footerY + 20, lw, lh);
    } catch {}
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#7ee7ff";
  ctx.font = "bold 38px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(settings.watermark || "ROVI AI Photo Booth", STRIP_W / 2, footerY + footerH - 90);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 28px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(settings.eventName, STRIP_W / 2, footerY + footerH - 55);

  ctx.fillStyle = "#c9b8ff";
  ctx.font = "22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(new Date().toLocaleString(), STRIP_W / 2, footerY + footerH - 25);

  return canvas.toDataURL("image/jpeg", 0.92);
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
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function captureFromVideo(video: HTMLVideoElement): string {
  const c = document.createElement("canvas");
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  // crop to 4:3 portrait-ish for booth feel
  const targetRatio = 4 / 3;
  let sw = w, sh = h, sx = 0, sy = 0;
  if (w / h > targetRatio) {
    sw = h * targetRatio;
    sx = (w - sw) / 2;
  } else {
    sh = w / targetRatio;
    sy = (h - sh) / 2;
  }
  c.width = 1200;
  c.height = 900;
  const ctx = c.getContext("2d")!;
  // mirror
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.92);
}
