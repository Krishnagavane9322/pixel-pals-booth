import type { Settings } from "./booth-storage";

// 2x6 inch canvas at 300 DPI = 600x1800px
// Layout: The canvas itself is a true 2x6 strip.
// DNP RX1 prints this and cuts at the 2" mark.
export const STRIP_W = 600; // 2" @ 300dpi
export const STRIP_H = 1800; // 6" @ 300dpi

function getTypography(
  type: "eventName" | "watermark",
  settings: Settings,
  theme: Settings["theme"],
  layout: "2x6" | "4x6" | "4x6-1shot",
) {
  const isFloral = theme === "floral";
  const isGarba = theme === "garba-midnight" || theme === "garba-crimson";
  const is4x6 = layout === "4x6" || layout === "4x6-1shot";

  if (type === "eventName") {
    let color = settings.eventNameColor;
    if (!color) {
      if (isGarba) {
        color = "#ffd700"; // Rich royal gold
      } else if (isFloral) {
        color = "#e0497f";
      } else {
        color = "#ffffff";
      }
    }

    let family = settings.eventNameFontFamily;
    if (!family) {
      if (isGarba) {
        family = "'Cinzel', 'Playfair Display', Georgia, serif";
      } else if (isFloral) {
        family = "'Brush Script MT', 'Great Vibes', cursive, sans-serif";
      } else {
        family = "ui-sans-serif, system-ui, sans-serif";
      }
    }

    let size = settings.eventNameFontSize;
    if (!size) {
      if (isGarba) {
        size = is4x6 ? 30 : 28;
      } else if (isFloral) {
        size = 44;
      } else {
        size = is4x6 ? 24 : 26;
      }
    }

    const weight = settings.eventNameFontWeight || (isFloral || isGarba ? "bold" : "600");
    const font = `${weight} ${size}px ${family}`;

    return { color, font, size, family, weight };
  } else {
    let color = settings.watermarkColor;
    if (!color) {
      if (isGarba) {
        color = "#ffe57f"; // Warm shimmering gold
      } else if (isFloral) {
        color = "#8d5940";
      } else {
        color = "#7ee7ff";
      }
    }

    let family = settings.watermarkFontFamily;
    if (!family) {
      if (isGarba) {
        family = "'Cinzel', 'Playfair Display', Georgia, serif";
      } else if (isFloral) {
        family = "Georgia, serif";
      } else {
        family = "ui-sans-serif, system-ui, sans-serif";
      }
    }

    let size = settings.watermarkFontSize;
    if (!size) {
      if (isGarba) {
        size = is4x6 ? 22 : 20;
      } else if (isFloral) {
        size = 24;
      } else {
        size = is4x6 ? 32 : 36;
      }
    }

    const weight = settings.watermarkFontWeight || (isFloral ? "italic 600" : "bold");
    const font = `${weight} ${size}px ${family}`;

    return { color, font, size, family, weight };
  }
}

function drawTextWithSettings(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: { color: string; font: string },
  align: "center" | "left" | "right" = "center",
  letterSpacing: number = 0,
  shadow: boolean = true,
) {
  if (!text) return;
  ctx.save();
  ctx.textAlign = align;
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  if (shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
  }
  if ("letterSpacing" in ctx && letterSpacing) {
    (ctx as any).letterSpacing = `${letterSpacing}px`;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCoverWithRadius(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number = 1.0,
  radius: number = 0,
  borderWidth: number = 0,
  borderColor?: string,
) {
  if (!img || !img.width || !img.height) return;

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(x, y, w, h, radius);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.clip();
  }

  drawCover(ctx, img, x, y, w, h, zoom);
  ctx.restore();

  if (borderWidth > 0 && borderColor) {
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    if (radius > 0 && typeof (ctx as any).roundRect === "function") {
      ctx.beginPath();
      (ctx as any).roundRect(x, y, w, h, radius);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
}

async function drawEventLogo(
  ctx: CanvasRenderingContext2D,
  settings: Settings,
  baseX: number,
  baseY: number,
  defaultHeight: number,
) {
  if (!settings.logoDataUrl) return;
  try {
    const logo = await loadImg(settings.logoDataUrl);
    if (!logo || !logo.width || !logo.height) return;

    const baseH = settings.logoSize || defaultHeight;
    const scale = settings.logoScale || 1.0;
    const lh = Math.round(baseH * scale);
    const lw = Math.round((logo.width / logo.height) * lh);

    const lx = Math.round(baseX - lw / 2 + (settings.logoPlacementX || 0));
    const ly = Math.round(baseY + (settings.logoPlacementY || 0));

    ctx.save();

    // Opacity
    if (
      settings.logoOpacity !== undefined &&
      settings.logoOpacity !== null &&
      settings.logoOpacity < 1.0
    ) {
      ctx.globalAlpha = Math.max(0.05, Math.min(1.0, settings.logoOpacity));
    }

    // Rotation around logo center
    if (settings.logoRotation) {
      const cx = lx + lw / 2;
      const cy = ly + lh / 2;
      ctx.translate(cx, cy);
      ctx.rotate((settings.logoRotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Border radius / clip if set
    if (settings.logoBorderRadius && settings.logoBorderRadius > 0) {
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(lx, ly, lw, lh, settings.logoBorderRadius);
      } else {
        ctx.rect(lx, ly, lw, lh);
      }
      ctx.clip();
    }

    ctx.drawImage(logo, lx, ly, lw, lh);
    ctx.restore();
  } catch (err) {
    console.warn("[Strip] Error drawing logo:", err);
  }
}

export async function buildStrip(photos: string[], settings: Settings): Promise<string> {
  const is4x6 = settings.printLayout === "4x6" || settings.printLayout === "4x6-1shot";
  const is1Shot = settings.printLayout === "4x6-1shot";
  const canvas = document.createElement("canvas");
  canvas.width = is4x6 ? 1800 : STRIP_W;
  canvas.height = is4x6 ? 1200 : STRIP_H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const w = canvas.width;
  const h = canvas.height;

  const currentTheme = settings.theme || "cyberpunk";
  const isFloral = currentTheme === "floral";
  const isGarbaMidnight = currentTheme === "garba-midnight";
  const isGarbaCrimson = currentTheme === "garba-crimson";
  const isGarba = isGarbaMidnight || isGarbaCrimson;

  const eventNameStyle = getTypography(
    "eventName",
    settings,
    currentTheme,
    settings.printLayout || "2x6",
  );
  const watermarkStyle = getTypography(
    "watermark",
    settings,
    currentTheme,
    settings.printLayout || "2x6",
  );

  // 1. Load theme background / overlay image and all photos
  let bgPromise: Promise<HTMLImageElement | null> = Promise.resolve(null);
  if (isFloral) {
    bgPromise = loadImg("/floral-bg.png");
  } else if (isGarba) {
    if (is4x6) {
      const bgUrl = isGarbaCrimson
        ? "/themes/garba-crimson-4x6.jpg"
        : "/themes/garba-midnight-4x6.jpg";
      bgPromise = loadImg(bgUrl);
    } else {
      const overlayUrl = isGarbaCrimson
        ? "/themes/garba-crimson-2x6.png"
        : "/themes/garba-midnight-2x6.png";
      bgPromise = loadImg(overlayUrl);
    }
  }

  const loadedImgs = await Promise.all(photos.map(loadImg));
  const bgImg = await bgPromise;
  const firstValid = loadedImgs.find((img): img is HTMLImageElement => img !== null);
  const imgs = loadedImgs.map((img) => img || firstValid || null);

  // 2. Draw background
  if (isFloral && bgImg) {
    if (is4x6) {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#fffcfb");
      grad.addColorStop(1, "#fdecee");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(bgImg, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
    }
  } else if (isGarba) {
    if (is4x6) {
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, isGarbaCrimson ? "#450414" : "#010937");
        grad.addColorStop(1, isGarbaCrimson ? "#1a0107" : "#020417");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      // Solid rich base color underneath the 2x6 frame cutouts
      ctx.fillStyle = isGarbaCrimson ? "#450414" : "#010937";
      ctx.fillRect(0, 0, STRIP_W, STRIP_H);
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
    if (is1Shot) {
      // --- 4x6 Single Photo (1 Shot) Layout ---
      const footerH = settings.footerHeight || 160;
      const footerY = 1200 - footerH;
      const photosAreaH = footerY;
      const scale = settings.photoScale || 1.0;

      const baseW = 1620;
      const baseH = 940;
      const photoW = Math.min(
        1760,
        Math.max(800, Math.round(baseW * scale - (settings.photoMarginSide || 0) * 2)),
      );
      const photoH = Math.min(photosAreaH - 30, Math.max(450, Math.round(baseH * scale)));
      const photoX = Math.round((1800 - photoW) / 2);
      const photoY = Math.max(
        20,
        Math.round((photosAreaH - photoH) / 2 + (settings.photoMarginTop || 0)),
      );

      const heroImg = imgs[0];
      if (heroImg) {
        if (isGarba) {
          drawCoverWithRadius(
            ctx,
            heroImg,
            photoX,
            photoY,
            photoW,
            photoH,
            settings.photoZoom,
            settings.photoBorderRadius ?? 14,
            settings.photoBorderWidth || 8,
            settings.photoBorderColor || "#d4af37",
          );

          // Inner golden metallic bevel highlight
          if (!settings.photoBorderWidth) {
            ctx.save();
            ctx.strokeStyle = "#fff275";
            ctx.lineWidth = 2;
            ctx.strokeRect(photoX + 2, photoY + 2, photoW - 4, photoH - 4);
            ctx.restore();
          }
        } else if (isFloral) {
          drawCoverWithRadius(
            ctx,
            heroImg,
            photoX,
            photoY,
            photoW,
            photoH,
            settings.photoZoom,
            settings.photoBorderRadius ?? 16,
            settings.photoBorderWidth || 8,
            settings.photoBorderColor || "#ff9ec3",
          );
        } else {
          // Cyberpunk
          drawCoverWithRadius(
            ctx,
            heroImg,
            photoX,
            photoY,
            photoW,
            photoH,
            settings.photoZoom,
            settings.photoBorderRadius ?? 12,
            settings.photoBorderWidth || 6,
            settings.photoBorderColor || "rgba(0, 245, 255, 0.6)",
          );
        }
      }

      // Draw 4x6 1-shot Footer
      if (isGarba) {
        ctx.save();
        const footerGrad = ctx.createLinearGradient(0, footerY, 0, footerY + footerH);
        footerGrad.addColorStop(
          0,
          isGarbaCrimson ? "rgba(55, 3, 13, 0.96)" : "rgba(1, 9, 55, 0.96)",
        );
        footerGrad.addColorStop(
          1,
          isGarbaCrimson ? "rgba(25, 1, 6, 0.98)" : "rgba(1, 4, 25, 0.98)",
        );
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, w, footerH);

        const goldTrim = ctx.createLinearGradient(0, 0, w, 0);
        goldTrim.addColorStop(0, "#d4af37");
        goldTrim.addColorStop(0.5, "#fff275");
        goldTrim.addColorStop(1, "#d4af37");
        ctx.fillStyle = goldTrim;
        ctx.fillRect(0, footerY, w, 5);

        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2 + 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 18;
          const dateColor = settings.dateColor || "#ffd700";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(undefined, { dateStyle: "medium" }),
            dateX,
            dateY,
            { color: dateColor, font: `600 ${dateSize}px 'Cinzel', Georgia, serif` },
            "center",
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "Navratri Dandiya Raas",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 115 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
        );
        ctx.restore();
      } else if (isFloral) {
        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 18;
          const dateColor = settings.dateColor || "#8a756a";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(undefined, { dateStyle: "medium" }),
            dateX,
            dateY,
            { color: dateColor, font: `500 ${dateSize}px Georgia, serif` },
            "center",
            0,
            false,
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "Some Bunny Is Turning One",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
          false,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 115 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
          false,
        );
      } else {
        // Cyberpunk
        ctx.fillStyle = "rgba(11,16,32,0.97)";
        ctx.fillRect(0, footerY, w, footerH);

        const footerGrad = ctx.createLinearGradient(0, 0, w, 0);
        footerGrad.addColorStop(0, "#00f5ff");
        footerGrad.addColorStop(1, "#b44dff");
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, w, 4);

        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2 + 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 20;
          const dateColor = settings.dateColor || "#c9b8ff";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(),
            dateX,
            dateY,
            { color: dateColor, font: `${dateSize}px ui-sans-serif, system-ui, sans-serif` },
            "center",
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "ROVI AI Photo Booth",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 110 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
        );
      }
    } else {
      // --- 4x6 Grid Print (4 Shots) Layout ---
      const scale = settings.photoScale || 1.0;
      const baseColW = 840;
      const baseRowH = 480;
      const colW = Math.round(baseColW * scale - (settings.photoMarginSide || 0) * 2);
      const rowH = Math.round(baseRowH * scale);
      const startX = 40 + (settings.photoMarginSide || 0);
      const gapX = 40;
      const startY = 40 + (settings.photoMarginTop || 0);
      const gapY = 40 + (settings.photoGapY || 0);

      for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const dx = startX + col * (colW + gapX);
        const dy = startY + row * (rowH + gapY);

        const img = imgs[i] || imgs[0]; // fallback if less than 4 photos
        if (!img) continue;

        if (isGarba) {
          drawCoverWithRadius(
            ctx,
            img,
            dx,
            dy,
            colW,
            rowH,
            settings.photoZoom,
            settings.photoBorderRadius || 0,
            settings.photoBorderWidth || 7,
            settings.photoBorderColor || "#d4af37",
          );

          if (!settings.photoBorderWidth) {
            ctx.save();
            ctx.strokeStyle = "#fff275";
            ctx.lineWidth = 2;
            ctx.strokeRect(dx + 2, dy + 2, colW - 4, rowH - 4);
            ctx.restore();
          }
        } else if (isFloral) {
          drawCoverWithRadius(
            ctx,
            img,
            dx,
            dy,
            colW,
            rowH,
            settings.photoZoom,
            settings.photoBorderRadius || 0,
            settings.photoBorderWidth || 8,
            settings.photoBorderColor || "#ff9ec3",
          );
        } else {
          // Cyberpunk
          drawCoverWithRadius(
            ctx,
            img,
            dx,
            dy,
            colW,
            rowH,
            settings.photoZoom,
            settings.photoBorderRadius || 0,
            settings.photoBorderWidth || 6,
            settings.photoBorderColor || "rgba(0, 245, 255, 0.5)",
          );
        }
      }

      // Draw 4x6 Grid Footer
      const footerH = settings.footerHeight || 160;
      const footerY = 1200 - footerH;

      if (isGarba) {
        ctx.save();
        const footerGrad = ctx.createLinearGradient(0, footerY, 0, footerY + footerH);
        footerGrad.addColorStop(
          0,
          isGarbaCrimson ? "rgba(55, 3, 13, 0.96)" : "rgba(1, 9, 55, 0.96)",
        );
        footerGrad.addColorStop(
          1,
          isGarbaCrimson ? "rgba(25, 1, 6, 0.98)" : "rgba(1, 4, 25, 0.98)",
        );
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, w, footerH);

        const goldTrim = ctx.createLinearGradient(0, 0, w, 0);
        goldTrim.addColorStop(0, "#d4af37");
        goldTrim.addColorStop(0.5, "#fff275");
        goldTrim.addColorStop(1, "#d4af37");
        ctx.fillStyle = goldTrim;
        ctx.fillRect(0, footerY, w, 5);

        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2 + 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 18;
          const dateColor = settings.dateColor || "#ffd700";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(undefined, { dateStyle: "medium" }),
            dateX,
            dateY,
            { color: dateColor, font: `600 ${dateSize}px 'Cinzel', Georgia, serif` },
            "center",
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "Navratri Dandiya Raas",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 115 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
        );
        ctx.restore();
      } else if (isFloral) {
        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 18;
          const dateColor = settings.dateColor || "#8a756a";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(undefined, { dateStyle: "medium" }),
            dateX,
            dateY,
            { color: dateColor, font: `500 ${dateSize}px Georgia, serif` },
            "center",
            0,
            false,
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "Some Bunny Is Turning One",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
          false,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 115 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
          false,
        );
      } else {
        // Cyberpunk
        ctx.fillStyle = "rgba(11,16,32,0.97)";
        ctx.fillRect(0, footerY, w, footerH);

        const footerGrad = ctx.createLinearGradient(0, 0, w, 0);
        footerGrad.addColorStop(0, "#00f5ff");
        footerGrad.addColorStop(1, "#b44dff");
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, w, 4);

        await drawEventLogo(
          ctx,
          settings,
          200,
          footerY + (footerH - (settings.logoSize || 80) * (settings.logoScale || 1.0)) / 2 + 2,
          80,
        );

        if (settings.showDate !== false) {
          const dateX = 1600 + (settings.datePlacementX || 0);
          const dateY = footerY + 90 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 20;
          const dateColor = settings.dateColor || "#c9b8ff";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(),
            dateX,
            dateY,
            { color: dateColor, font: `${dateSize}px ui-sans-serif, system-ui, sans-serif` },
            "center",
          );
        }

        const cx = w / 2;
        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 55 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "ROVI AI Photo Booth",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 110 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
        );
      }
    }
  } else {
    // --- 2x6 Strip Layout ---
    if (isGarba) {
      // Determine base box size from settings or defaults:
      const customW = settings.stripPhotoWidth || 0;
      const customH = settings.stripPhotoHeight || 0;
      const baseW = customW > 0 ? customW : 437;
      const baseH = customH > 0 ? customH : 344;

      const scale = settings.photoScale || 1.0;
      const marginSide = settings.photoMarginSide || 0;
      const marginTop = settings.photoMarginTop || 0;
      const gapY = settings.photoGapY || 0;

      const fw = Math.round(Math.min(590, Math.max(300, baseW * scale - marginSide * 2)));
      const fh = Math.round(Math.min(520, Math.max(220, baseH * scale)));
      const fx = Math.round(300 - fw / 2);

      // If user enlarged boxes beyond default cutouts, render them proudly on top of overlay!
      const isGrandBoxes = fw > 445 || fh > 355 || scale > 1.05;

      const baseY0 = 236;
      const baseGap = 56;
      const heightGrowth = Math.max(0, fh - 344);
      const startY = Math.max(35, Math.round(baseY0 + marginTop - heightGrowth * 0.55));
      const effectiveGap = Math.max(-25, Math.round(baseGap + gapY - heightGrowth * 0.35));

      if (!isGrandBoxes) {
        // Classic mode: Draw behind cutout frames
        for (let i = 0; i < 3; i++) {
          const img = imgs[i];
          if (img) {
            const fy = startY + i * (fh + effectiveGap);
            drawCoverWithRadius(
              ctx,
              img,
              fx,
              fy,
              fw,
              fh,
              settings.photoZoom,
              settings.photoBorderRadius || 0,
              settings.photoBorderWidth || 0,
              settings.photoBorderColor,
            );
          }
        }

        // Overlay on top
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
        }
      } else {
        // Grand / Enlarged mode: Draw overlay first, then large photos on top with royal frame!
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
        }

        for (let i = 0; i < 3; i++) {
          const img = imgs[i];
          if (img) {
            const fy = startY + i * (fh + effectiveGap);

            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;

            drawCoverWithRadius(
              ctx,
              img,
              fx,
              fy,
              fw,
              fh,
              settings.photoZoom,
              settings.photoBorderRadius ?? 8,
              settings.photoBorderWidth || 7,
              settings.photoBorderColor || "#d4af37",
            );
            ctx.restore();

            // Inner golden metallic bevel highlight
            if (!settings.photoBorderWidth) {
              ctx.save();
              ctx.strokeStyle = "#fff275";
              ctx.lineWidth = 2;
              ctx.strokeRect(fx + 2, fy + 2, fw - 4, fh - 4);
              ctx.restore();
            }
          }
        }
      }

      // Dynamic branding inside royal footer arch
      ctx.save();
      const cx = 300; // Center of strip

      // Logo with zoom & adjustments
      await drawEventLogo(ctx, settings, cx, 1515, 45);

      // Event Name
      const eventNameBaseY = settings.logoDataUrl ? 1585 : 1565;
      const eventNameY = eventNameBaseY + (settings.eventNamePlacementY || 0);
      const eventNameAlign = settings.eventNameAlign || "center";
      let eventNameX = cx + (settings.eventNamePlacementX || 0);
      if (eventNameAlign === "left") eventNameX = 120 + (settings.eventNamePlacementX || 0);
      if (eventNameAlign === "right") eventNameX = 480 + (settings.eventNamePlacementX || 0);

      drawTextWithSettings(
        ctx,
        settings.eventName,
        eventNameX,
        eventNameY,
        eventNameStyle,
        eventNameAlign,
        settings.eventNameLetterSpacing || 0,
      );

      // Watermark / Subtitle
      const watermarkBaseY = settings.logoDataUrl ? 1622 : 1605;
      const watermarkY = watermarkBaseY + (settings.watermarkPlacementY || 0);
      const watermarkAlign = settings.watermarkAlign || "center";
      let watermarkX = cx + (settings.watermarkPlacementX || 0);
      if (watermarkAlign === "left") watermarkX = 120 + (settings.watermarkPlacementX || 0);
      if (watermarkAlign === "right") watermarkX = 480 + (settings.watermarkPlacementX || 0);

      drawTextWithSettings(
        ctx,
        settings.watermark || "Navratri Dandiya Raas",
        watermarkX,
        watermarkY,
        watermarkStyle,
        watermarkAlign,
        settings.watermarkLetterSpacing || 0,
      );

      // Date
      if (settings.showDate !== false) {
        const dateBaseY = settings.logoDataUrl ? 1655 : 1642;
        const dateY = dateBaseY + (settings.datePlacementY || 0);
        const dateX = cx + (settings.datePlacementX || 0);
        const dateSize = settings.dateFontSize || 16;
        const dateColor = settings.dateColor || "#d4af37";
        drawTextWithSettings(
          ctx,
          new Date().toLocaleString(undefined, { dateStyle: "medium" }),
          dateX,
          dateY,
          { color: dateColor, font: `600 ${dateSize}px 'Cinzel', Georgia, serif` },
          "center",
        );
      }
      ctx.restore();
    } else {
      const footerH = settings.footerHeight || 200;
      const photosAreaH = STRIP_H - footerH;
      const scale = settings.photoScale || 1.0;
      const marginSide = settings.photoMarginSide || 0;
      const marginTop = settings.photoMarginTop || 0;
      const gapY = settings.photoGapY || 0;

      const customW = settings.stripPhotoWidth || 0;
      const customH = settings.stripPhotoHeight || 0;

      const basePhotoH = customH > 0 ? customH : Math.floor(photosAreaH / 3);
      const photoH = Math.round(basePhotoH * scale);

      for (let i = 0; i < 3; i++) {
        if (isFloral) {
          const baseW = customW > 0 ? customW : STRIP_W - 48;
          const dw = Math.round(Math.min(STRIP_W, Math.max(100, baseW * scale - marginSide * 2)));
          const dx = Math.round((STRIP_W - dw) / 2);
          const dy = Math.max(0, marginTop + i * (photoH + (16 + gapY)));

          drawCoverWithRadius(
            ctx,
            imgs[i],
            dx,
            dy,
            dw,
            photoH,
            settings.photoZoom,
            settings.photoBorderRadius || 0,
            settings.photoBorderWidth || 6,
            settings.photoBorderColor || "#ff9ec3",
          );
        } else {
          // Cyberpunk
          const baseW = customW > 0 ? customW : STRIP_W;
          const dw = Math.round(Math.min(STRIP_W, Math.max(100, baseW * scale - marginSide * 2)));
          const dx = Math.round((STRIP_W - dw) / 2);
          const dy = Math.max(0, marginTop + i * (photoH + gapY));

          drawCoverWithRadius(
            ctx,
            imgs[i],
            dx,
            dy,
            dw,
            photoH,
            settings.photoZoom,
            settings.photoBorderRadius || 0,
            settings.photoBorderWidth || 0,
            settings.photoBorderColor,
          );

          if (!settings.photoBorderWidth && i < 2) {
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(dx, dy + photoH - 2, dw, 4);
          }
        }
      }

      // Draw Footer
      const footerY = STRIP_H - footerH;

      if (isFloral) {
        const cx = STRIP_W * 0.64;

        await drawEventLogo(ctx, settings, cx, footerY + 12, 50);

        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + 70 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "Some Bunny Is Turning One",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
          false,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + 125 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
          false,
        );

        if (settings.showDate !== false) {
          const dateX = cx + (settings.datePlacementX || 0);
          const dateY = footerY + 165 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 16;
          const dateColor = settings.dateColor || "#8a756a";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(undefined, { dateStyle: "medium" }),
            dateX,
            dateY,
            { color: dateColor, font: `500 ${dateSize}px Georgia, serif` },
            "center",
            0,
            false,
          );
        }
      } else {
        // Cyberpunk footer
        ctx.fillStyle = "rgba(11,16,32,0.97)";
        ctx.fillRect(0, footerY, STRIP_W, footerH);

        const footerGrad = ctx.createLinearGradient(0, 0, STRIP_W, 0);
        footerGrad.addColorStop(0, "#00f5ff");
        footerGrad.addColorStop(1, "#b44dff");
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, STRIP_W, 4);

        const cx = STRIP_W / 2;

        await drawEventLogo(ctx, settings, cx, footerY + 12, 70);

        const watermarkX = cx + (settings.watermarkPlacementX || 0);
        const watermarkY = footerY + footerH - 76 + (settings.watermarkPlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.watermark || "ROVI AI Photo Booth",
          watermarkX,
          watermarkY,
          watermarkStyle,
          settings.watermarkAlign || "center",
          settings.watermarkLetterSpacing || 0,
        );

        const eventNameX = cx + (settings.eventNamePlacementX || 0);
        const eventNameY = footerY + footerH - 46 + (settings.eventNamePlacementY || 0);
        drawTextWithSettings(
          ctx,
          settings.eventName,
          eventNameX,
          eventNameY,
          eventNameStyle,
          settings.eventNameAlign || "center",
          settings.eventNameLetterSpacing || 0,
        );

        if (settings.showDate !== false) {
          const dateX = cx + (settings.datePlacementX || 0);
          const dateY = footerY + footerH - 18 + (settings.datePlacementY || 0);
          const dateSize = settings.dateFontSize || 20;
          const dateColor = settings.dateColor || "#c9b8ff";
          drawTextWithSettings(
            ctx,
            new Date().toLocaleString(),
            dateX,
            dateY,
            { color: dateColor, font: `${dateSize}px ui-sans-serif, system-ui, sans-serif` },
            "center",
          );
        }
      }
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
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number = 1.0,
) {
  if (!img || !img.width || !img.height) return;
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
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

export async function captureFromVideo(
  video: HTMLVideoElement,
  cssFilter?: string,
): Promise<string> {
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
  // High clarity & edge sharpness filter for crystal-clear faces at any distance
  ctx.filter = cssFilter || "contrast(1.10) saturate(1.06)";
  ctx.drawImage(video, 0, 0, vw, vh);
  return c.toDataURL("image/jpeg", 0.96);
}
