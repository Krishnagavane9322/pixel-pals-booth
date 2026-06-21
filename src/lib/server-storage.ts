import { createServerFn } from "@tanstack/react-start";
import { put, list, head } from "@vercel/blob";
import fs from "fs";
import path from "path";

export type CloudPhotoData = {
  url: string;
  eventName: string;
  createdAt: number;
};

// Server function to upload photo strip to Vercel Blob
export const uploadPhoto = createServerFn({ method: "POST" })
  .validator((d: { id: string; dataUrl: string; eventName: string }) => d)
  .handler(async ({ data }) => {
    // Check if token exists, if not fall back to local disk storage
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn("BLOB_READ_WRITE_TOKEN environment variable is not defined. Saving to local public/photos/.");
      try {
        const base64Data = data.dataUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        const dir = path.join(process.cwd(), "public", "photos");
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const filename = `${data.id}.jpg`;
        const filePath = path.join(dir, filename);
        await fs.promises.writeFile(filePath, buffer);

        return { success: true, url: `/photos/${filename}` };
      } catch (err: any) {
        console.error("Failed to save local photo:", err);
        return { success: false, error: "Offline local save failed: " + err.message };
      }
    }

    try {
      const base64Data = data.dataUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");

      const filename = `photos/${data.id}___${encodeURIComponent(data.eventName)}___${Date.now()}.jpg`;
      const blob = await put(filename, buffer, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });

      return { success: true, url: blob.url };
    } catch (err: any) {
      console.error("Failed to upload photo to Vercel Blob:", err);
      return { success: false, error: err.message };
    }
  });

// Server function to fetch photo strip from Vercel Blob
export const getCloudPhoto = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { success: false, error: "No token" };
    }

    try {
      // Find the file by prefix matching the photo ID
      const { blobs } = await list({ prefix: `photos/${id}` });
      if (blobs.length === 0) {
        return { success: false, error: "Not found" };
      }

      const blobInfo = blobs[0];
      
      let eventName = "ROVI Live Event";
      let createdAt = blobInfo.uploadedAt ? blobInfo.uploadedAt.getTime() : Date.now();

      const parts = blobInfo.pathname.split("___");
      if (parts.length >= 3) {
        try {
          eventName = decodeURIComponent(parts[1]);
          const timeStr = parts[2].replace(/\.[^/.]+$/, "");
          createdAt = Number(timeStr);
        } catch (e) {
          console.warn("Failed to parse eventName or createdAt from pathname:", e);
        }
      }

      return {
        success: true,
        data: {
          url: blobInfo.url,
          eventName,
          createdAt,
        } as CloudPhotoData,
      };
    } catch (err: any) {
      console.error("Failed to fetch photo from Vercel Blob:", err);
      return { success: false, error: err.message };
    }
  });
