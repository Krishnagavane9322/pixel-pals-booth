import { createServerFn } from "@tanstack/react-start";
import { put, list, head } from "@vercel/blob";

export type CloudPhotoData = {
  url: string;
  eventName: string;
  createdAt: number;
};

// Server function to upload photo strip to Vercel Blob
export const uploadPhoto = createServerFn({ method: "POST" })
  .validator((d: { id: string; dataUrl: string; eventName: string }) => d)
  .handler(async ({ data }) => {
    // Check if token exists, if not fail gracefully for local-only offline mode
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn("BLOB_READ_WRITE_TOKEN environment variable is not defined. Falling back to offline mode.");
      return { success: false, error: "Offline mode: No token" };
    }

    try {
      const base64Data = data.dataUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");

      const blob = await put(`photos/${data.id}.jpg`, buffer, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        metadata: {
          eventName: data.eventName,
          createdAt: String(Date.now()),
        },
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
      
      // Fetch full metadata to get custom fields
      let eventName = "ROVI Live Event";
      let createdAt = blobInfo.uploadedAt ? blobInfo.uploadedAt.getTime() : Date.now();

      try {
        const meta = await head(blobInfo.url);
        if (meta.metadata) {
          if (meta.metadata.eventName) eventName = meta.metadata.eventName;
          if (meta.metadata.createdAt) createdAt = Number(meta.metadata.createdAt);
        }
      } catch (metaErr) {
        console.warn("Could not retrieve custom blob metadata:", metaErr);
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
