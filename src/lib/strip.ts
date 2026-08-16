import type { Settings } from "./booth-storage";

// 2x6 inch canvas at 300 DPI = 600x1800px
// Layout: The canvas itself is a true 2x6 strip.
// DNP RX1 prints this and cuts at the 2" mark.
export const STRIP_W = 600;   // 2" @ 300dpi
export const STRIP_H = 1800;   // 6" @ 300dpi

function getTypography(
  type: "eventName" | "watermark",
  settings: Settings,
  theme: "cyberpunk" | "floral",
  layout: "2x6" | "4x6"
) {
  const isFloral = theme === "floral";
  const is4x6 = layout === "4x6";
  
  if (type === "eventName") {
    let color = settings.eventNameColor;
    if (!color) {
      color = isFloral ? "#e0497f" : "#ffffff";
    }
    
    let family = settings.eventNameFontFamily;
    if (!family) {
      family = isFloral 
        ? "'Brush Script MT', 'Great Vibes', cursive, sans-serif" 
        : "ui-sans-serif, system-ui, sans-serif";
    }
    
    let size = settings.eventNameFontSize;
    if (!size) {
      if (isFloral) {
        size = 44;
      } else {
        size = is4x6 ? 24 : 26;
      }
    }
    
    const fontStyle = isFloral ? `bold ${size}px` : `600 ${size}px`;
    const font = `${fontStyle} ${family}`;
    
    return { color, font };
  } else {
    let color = settings.watermarkColor;
    if (!color) {
      color = isFloral ? "#8d5940" : "#7ee7ff";
    }
    
    let family = settings.watermarkFontFamily;
    if (!family) {
      family = isFloral 
        ? "Georgia, serif" 
        : "ui-sans-serif, system-ui, sans-serif";
    }
    
    let size = settings.watermarkFontSize;
    if (!size) {
      if (isFloral) {
        size = 24;
      } else {
        size = is4x6 ? 32 : 36;
      }
    }
    
    const fontStyle = isFloral ? `italic 600 ${size}px` : `bold ${size}px`;
    const font = `${fontStyle} ${family}`;
    
    return { color, font };
  }
}

export async function buildStrip(
  photos: string[],
  settings: Settings,
): Promise<string> {
  const is4x6 = settings.printLayout === "4x6";
  const canvas = document.createElement("canvas");
  canvas.width = is4x6 ? 1800 : STRIP_W;
  canvas.height = is4x6 ? 1200 : STRIP_H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const w = canvas.width;
  const h = canvas.height;

  const eventNameStyle = getTypography("eventName", settings, settings.theme || "cyberpunk", settings.printLayout || "2x6");
  const watermarkStyle = getTypography("watermark", settings, settings.theme || "cyberpunk", settings.printLayout || "2x6");

  // 1. Load background if floral theme, and all photos
  const isFloral = settings.theme === "floral";
  const bgPromise = isFloral ? loadImg("/floral-bg.png") : Promise.resolve(null);
  const loadedImgs = await Promise.all(photos.map(loadImg));
  const bgImg = await bgPromise;
  const firstValid = loadedImgs.find((img): img is HTMLImageElement => img !== null);
  const imgs = loadedImgs.map((img) => img || firstValid || null);

  // 2. Draw background
  if (isFloral && bgImg) {
    if (is4x6) {
      // Draw a soft background gradient first
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#fffcfb");
      grad.addColorStop(1, "#fdecee");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Overlay the floral background image with low opacity
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(bgImg, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
    }
  } else {
    // Cyberpunk gradient background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0b1020");
    grad.addColorStop(1, "#1a0b2e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  if (is4x6) {
    // --- 4x6 Layout ---
    // 2x2 grid of 4 photos
    // Columns: x = 40 (col 0), x = 920 (col 1), width = 840
    // Rows: y = 40 (row 0), y = 560 (row 1), height = 480
    // Footer: y = 1040 to 1200
    const colW = 840;
    const rowH = 480;
    const startX = 40;
    const gapX = 40;
    const startY = 40;
    const gapY = 40;

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const dx = startX + col * (colW + gapX);
      const dy = startY + row * (rowH + gapY);
      
      const img = imgs[i] || imgs[0]; // fallback if less than 4 photos
      if (!img) continue;

      if (isFloral) {
        // Draw photo
        drawCover(ctx, img, dx, dy, colW, rowH, settings.photoZoom);
        
        // Soft pink outer frame border
        ctx.strokeStyle = "#ff9ec3";
        ctx.lineWidth = 8;
        ctx.strokeRect(dx, dy, colW, rowH);
      } else {
        // Draw photo
        drawCover(ctx, img, dx, dy, colW, rowH, settings.photoZoom);

        // Neon border for Cyberpunk
        ctx.save();
        ctx.strokeStyle = "rgba(0, 245, 255, 0.5)"; // neon cyan border
        ctx.lineWidth = 6;
        ctx.strokeRect(dx, dy, colW, rowH);
        
        // Add neon glow effect corner lines or shadow
        ctx.shadowColor = "#00f5ff";
        ctx.shadowBlur = 10;
        ctx.strokeStyle = "#00f5ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, colW, rowH);
        ctx.restore();
      }
    }

    // Draw 4x6 Footer
    const footerY = 1040;
    const footerH = 160;

    if (isFloral) {
      // Draw event logo if uploaded on the left
      if (settings.logoDataUrl) {
        try {
          const logo = await loadImg(settings.logoDataUrl);
          if (!logo) throw new Error("logo null");
          const lh = 80;
          const lw = (logo.width / logo.height) * lh;
          ctx.drawImage(logo, 200 - lw / 2, footerY + (footerH - lh) / 2, lw, lh);
        } catch {}
      }

      // Draw date on the right
      ctx.fillStyle = "#8a756a";
      ctx.font = "500 18px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(new Date().toLocaleString(undefined, { dateStyle: "medium" }), 1600, footerY + 90);

      // Centered text
      ctx.textAlign = "center";
      const cx = w / 2;

      // Watermark text
      ctx.fillStyle = watermarkStyle.color;
      ctx.font = watermarkStyle.font;
      ctx.fillText(settings.watermark || "Some Bunny Is Turning One", cx, footerY + 55);

      // Event name
      ctx.fillStyle = eventNameStyle.color;
      ctx.font = eventNameStyle.font;
      ctx.fillText(settings.eventName, cx, footerY + 115);
    } else {
      // Cyberpunk footer background
      ctx.fillStyle = "rgba(11,16,32,0.97)";
      ctx.fillRect(0, footerY, w, footerH);

      // Neon gradient border at top of footer
      const footerGrad = ctx.createLinearGradient(0, 0, w, 0);
      footerGrad.addColorStop(0, "#00f5ff");
      footerGrad.addColorStop(1, "#b44dff");
      ctx.fillStyle = footerGrad;
      ctx.fillRect(0, footerY, w, 4);

      // Draw event logo on the left
      if (settings.logoDataUrl) {
        try {
          const logo = await loadImg(settings.logoDataUrl);
          if (!logo) throw new Error("logo null");
          const lh = 80;
          const lw = (logo.width / logo.height) * lh;
          ctx.drawImage(logo, 200 - lw / 2, footerY + (footerH - lh) / 2 + 2, lw, lh);
        } catch {}
      }

      // Draw date on the right
      ctx.fillStyle = "#c9b8ff";
      ctx.font = "20px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(new Date().toLocaleString(), 1600, footerY + 90);

      // Centered text
      ctx.textAlign = "center";
      const cx = w / 2;

      // Watermark text
      ctx.fillStyle = watermarkStyle.color;
      ctx.font = watermarkStyle.font;
      ctx.fillText(settings.watermark || "ROVI AI Photo Booth", cx, footerY + 55);

      // Event name
      ctx.fillStyle = eventNameStyle.color;
      ctx.font = eventNameStyle.font;
      ctx.fillText(settings.eventName, cx, footerY + 110);
    }
  } else {
    // --- Original 2x6 Layout ---
    const footerH = 200;
    const photosAreaH = STRIP_H - footerH;
    const photoH = Math.floor(photosAreaH / 3);

    for (let i = 0; i < 3; i++) {
      const y = i * photoH;
      
      if (isFloral) {
        // Elegant pink border layout for floral theme
        const paddingX = 24;
        const paddingY = 16;
        const dx = paddingX;
        const dy = y + paddingY;
        const dw = STRIP_W - paddingX * 2;
        const dh = photoH - paddingY * 2;
        
        // Draw cover-cropped photo with zoom
        drawCover(ctx, imgs[i], dx, dy, dw, dh, settings.photoZoom);
        
        // Soft pink outer frame border
        ctx.strokeStyle = "#ff9ec3";
        ctx.lineWidth = 6;
        ctx.strokeRect(dx, dy, dw, dh);
      } else {
        // Full bleed for cyberpunk
        drawCover(ctx, imgs[i], 0, y, STRIP_W, photoH, settings.photoZoom);

        // Separator line between photos
        if (i < 2) {
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(0, y + photoH - 2, STRIP_W, 4);
        }
      }
    }

    // Draw Footer
    const footerY = photosAreaH;

    if (isFloral) {
      // Floral text content (bunny decoration is already in the background template)
      ctx.textAlign = "center";
      const cx = STRIP_W * 0.64; // center of text block on the right half, avoiding the bunny on the left
      
      // Draw event logo if uploaded (above the text)
      if (settings.logoDataUrl) {
        try {
          const logo = await loadImg(settings.logoDataUrl);
          if (!logo) throw new Error("logo null");
          const lh = 50;
          const lw = (logo.width / logo.height) * lh;
          ctx.drawImage(logo, cx - lw / 2, footerY + 12, lw, lh);
        } catch {}
      }

      // Watermark text
      ctx.fillStyle = watermarkStyle.color;
      ctx.font = watermarkStyle.font;
      ctx.fillText(settings.watermark || "Some Bunny Is Turning One", cx, footerY + 70);

      // Event name
      ctx.fillStyle = eventNameStyle.color;
      ctx.font = eventNameStyle.font;
      ctx.fillText(settings.eventName, cx, footerY + 125);

      // Date
      ctx.fillStyle = "#8a756a"; // soft beige brown print color
      ctx.font = "500 16px Georgia, serif";
      ctx.fillText(new Date().toLocaleString(undefined, { dateStyle: "medium" }), cx, footerY + 165);
    } else {
      // Cyberpunk footer
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
          if (!logo) throw new Error("logo null");
          const lh = 70;
          const lw = (logo.width / logo.height) * lh;
          ctx.drawImage(logo, (STRIP_W - lw) / 2, footerY + 12, lw, lh);
        } catch {}
      }

      ctx.textAlign = "center";
      const cx = STRIP_W / 2; // center of strip

      ctx.fillStyle = watermarkStyle.color;
      ctx.font = watermarkStyle.font;
      ctx.fillText(settings.watermark || "ROVI AI Photo Booth", cx, footerY + footerH - 76);

      ctx.fillStyle = eventNameStyle.color;
      ctx.font = eventNameStyle.font;
      ctx.fillText(settings.eventName, cx, footerY + footerH - 46);

      ctx.fillStyle = "#c9b8ff";
      ctx.font = "20px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(new Date().toLocaleString(), cx, footerY + footerH - 18);
    }
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("[Strip] Image load skipped:", src?.substring(0, 40));
      resolve(null);
    };
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number, y: number, w: number, h: number,
  zoom: number = 1.0,
) {
  if (!img || !img.width || !img.height) return;
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

// Wait for N fresh decoded frames from the video element
function waitForFrames(video: HTMLVideoElement, frameCount = 2): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };

    // Hard 200ms max safety timeout
    const timer = setTimeout(finish, 200);

    if (typeof (video as any).requestVideoFrameCallback === "function") {
      let remaining = frameCount;
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          clearTimeout(timer);
          finish();
        } else {
          (video as any).requestVideoFrameCallback(tick);
        }
      };
      (video as any).requestVideoFrameCallback(tick);
    } else {
      setTimeout(() => {
        clearTimeout(timer);
        finish();
      }, frameCount * 80);
    }
  });
}

export async function captureFromVideo(video: HTMLVideoElement, cssFilter?: string): Promise<string> {
  // Wait for 2 stable decoded frames so the camera sensor, auto-exposure,
  // and auto-focus have fully settled AFTER the flash fired.
  await waitForFrames(video, 2);

  const c = document.createElement("canvas");
  const vw = video.videoWidth || 1920;
  const vh = video.videoHeight || 1080;

  // Capture full frame native DSLR resolution
  c.width = vw;
  c.height = vh;
  const ctx = c.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Mirror horizontally (selfie view)
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  if (cssFilter) {
    ctx.filter = cssFilter;
  } else {
    // Subtle clarity enhancement: contrast + saturation pop for DSLR/Webcam stills
    ctx.filter = "contrast(1.05) saturate(1.08)";
  }
  ctx.drawImage(video, 0, 0, vw, vh);
  return c.toDataURL("image/jpeg", 0.88);
}

