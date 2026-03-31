import { Storage } from "@google-cloud/storage";
import sharp from "sharp";

/**
 * Convert HEIC/HEIF images to JPEG format
 * This ensures compatibility with all downstream processing services
 */
const convertHeicToJpeg = async (
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; converted: boolean }> => {
  const isHeic = contentType === "image/heic" || contentType === "image/heif";

  if (!isHeic) {
    return { buffer, contentType, converted: false };
  }

  try {
    console.log(`\n🔄 [HEIC CONVERSION] Starting conversion...`);
    console.log(`   Input: ${contentType}`);
    console.log(`   Input size: ${(buffer.length / 1024).toFixed(2)} KB`);

    const convertStartTime = Date.now();

    // Try with different Sharp configurations for better HEIC compatibility
    let convertedBuffer: Buffer;

    try {
      // First attempt: Standard JPEG conversion
      convertedBuffer = await sharp(buffer, {
        unlimited: true,
        failOn: "none", // Don't fail on warnings
      })
        .jpeg({ quality: 95 })
        .toBuffer();
    } catch (error) {
      console.log(`   ⚠️  Standard conversion failed, trying PNG fallback...`);
      // Fallback: Convert to PNG first (more compatible), then to JPEG
      const pngBuffer = await sharp(buffer, {
        unlimited: true,
        failOn: "none",
      })
        .png()
        .toBuffer();

      convertedBuffer = await sharp(pngBuffer).jpeg({ quality: 95 }).toBuffer();
    }

    const convertDuration = Date.now() - convertStartTime;

    console.log(`✅ [HEIC CONVERSION] Successfully converted to JPEG`);
    console.log(
      `   Output size: ${(convertedBuffer.length / 1024).toFixed(2)} KB`,
    );
    console.log(
      `   Size change: ${((convertedBuffer.length / buffer.length - 1) * 100).toFixed(1)}%`,
    );
    console.log(`   Conversion time: ${convertDuration}ms`);

    return {
      buffer: convertedBuffer,
      contentType: "image/jpeg",
      converted: true,
    };
  } catch (error) {
    console.error(`\n❌ [HEIC CONVERSION] Failed to convert HEIC/HEIF:`);
    console.error(`   Error:`, error instanceof Error ? error.message : error);
    console.error(
      `   Stack:`,
      error instanceof Error ? error.stack : "No stack",
    );
    console.error(
      `   This HEIC file may use unsupported compression (H.265/HEVC)`,
    );
    console.error(`   Will attempt to upload as-is (may fail downstream)`);
    return { buffer, contentType, converted: false };
  }
};

// Initialize Google Cloud Storage
const initializeGCS = (): { storage: Storage; bucketName: string } => {
  // Storage client will automatically use Application Default Credentials (ADC)
  // This works with GOOGLE_APPLICATION_CREDENTIALS env var or gcloud auth
  const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });

  const bucketName = process.env.GCS_BUCKET_NAME!;

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME environment variable is required");
  }

  console.log(`GCS Service initialized with bucket: ${bucketName}`);
  return { storage, bucketName };
};

// Get GCS instances (lazy initialization)
let gcsInstances: { storage: Storage; bucketName: string } | null = null;
const getGCSInstances = () => {
  if (!gcsInstances) {
    gcsInstances = initializeGCS();
  }
  return gcsInstances;
};

const sanitizeUserId = (userId: string): string => {
  return `${userId.toString()}`;
};

// Main functions
export const uploadFile = async (
  buffer: Buffer,
  fileName: string,
  userId: string,
  folder: string = "Avatar/Processed",
  contentType: string = "image/png",
): Promise<{ httpUrl: string; gsUri: string }> => {
  try {
    const { storage, bucketName } = getGCSInstances();
    const bucket = storage.bucket(bucketName);

    // Convert HEIC/HEIF to JPEG if needed
    const {
      buffer: processedBuffer,
      contentType: finalContentType,
      converted,
    } = await convertHeicToJpeg(buffer, contentType);

    // Update filename extension if converted
    let finalFileName = fileName;
    if (
      converted &&
      (fileName.toLowerCase().endsWith(".heic") ||
        fileName.toLowerCase().endsWith(".heif"))
    ) {
      finalFileName = fileName.replace(/\.(heic|heif)$/i, ".jpg");
      console.log(`📝 Filename updated: ${fileName} → ${finalFileName}`);
    }

    const userFolder = sanitizeUserId(userId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileKey = `${userFolder}/${folder}/${timestamp}_${finalFileName}`;

    console.log(`Uploading file to GCS: ${fileKey}`);

    const file = bucket.file(fileKey);

    // Upload the file (using converted buffer if HEIC was converted)
    await file.save(processedBuffer, {
      contentType: finalContentType,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });

    // Make the file publicly accessible (optional, based on your bucket settings)
    // await file.makePublic();

    // Get both the public URL and gs:// URI
    const httpUrl = `https://storage.googleapis.com/${bucketName}/${fileKey}`;
    const gsUri = `gs://${bucketName}/${fileKey}`;

    console.log(`File uploaded successfully:`);
    console.log(`  HTTP URL: ${httpUrl}`);
    console.log(`  GS URI: ${gsUri}`);
    return { httpUrl, gsUri };
  } catch (error) {
    console.error("Error uploading file to GCS:", error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const isReauthIssue =
      rawMessage.includes("rapt_required") ||
      rawMessage.includes("invalid_grant");

    if (isReauthIssue) {
      throw new Error(
        "GCS authentication failed (reauth required). The backend container is using user ADC credentials that need interactive re-login. Use a service-account JSON key via GOOGLE_APPLICATION_CREDENTIALS in Docker, or run `gcloud auth application-default login` again and restart the container.",
      );
    }

    throw new Error(
      `Failed to upload file to GCS: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};

export const uploadBase64Image = async (
  base64Data: string,
  fileName: string,
  userId: string,
  folder: string = "Avatar/Processed",
  contentType: string = "image/png",
): Promise<{ httpUrl: string; gsUri: string }> => {
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    return await uploadFile(buffer, fileName, userId, folder, contentType);
  } catch (error) {
    console.error("Error uploading base64 image to GCS:", error);
    throw new Error(
      `Failed to upload base64 image to GCS: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};

export const ensureUserFolderExists = async (userId: string): Promise<void> => {
  try {
    const { storage, bucketName } = getGCSInstances();
    const bucket = storage.bucket(bucketName);
    const userFolder = sanitizeUserId(userId);
    const folderKey = `${userFolder}/.keep`;

    // Check if folder marker exists
    const [files] = await bucket.getFiles({
      prefix: `${userFolder}/`,
      maxResults: 1,
    });

    if (files.length === 0) {
      console.log(`Creating user folder: ${userFolder}`);

      // Create a marker file to represent the folder
      const file = bucket.file(folderKey);
      await file.save("", {
        contentType: "text/plain",
      });

      console.log(`User folder created: ${userFolder}`);
    } else {
      console.log(`User folder already exists: ${userFolder}`);
    }
  } catch (error) {
    console.error("Error ensuring user folder exists:", error);
    // Don't throw - this is a non-critical operation
  }
};

/**
 * Delete a single GCS file by its gs:// URI or https:// URL.
 * Silently skips if the file does not exist.
 */
export const deleteFileByUri = async (uri: string): Promise<void> => {
  if (!uri) return;
  try {
    const { storage, bucketName } = getGCSInstances();
    const bucket = storage.bucket(bucketName);

    let filePath: string;
    if (uri.startsWith("gs://")) {
      // gs://<bucket>/<path>
      filePath = uri.replace(`gs://${bucketName}/`, "");
    } else if (uri.startsWith("https://storage.googleapis.com/")) {
      // https://storage.googleapis.com/<bucket>/<path>
      filePath = uri.replace(
        `https://storage.googleapis.com/${bucketName}/`,
        "",
      );
    } else {
      console.warn(`[GCS] Unrecognised URI format, skipping deletion: ${uri}`);
      return;
    }

    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      console.log(`[GCS] Deleted file: ${filePath}`);
    }
  } catch (err) {
    console.error(
      `[GCS] Failed to delete file ${uri}:`,
      err instanceof Error ? err.message : err,
    );
  }
};

/**
 * Delete every GCS object that lives under a user's folder ({userId}/).
 * This wipes all avatars, apparel images, outfit composites, accessories etc.
 */
export const deleteUserFolder = async (userId: number): Promise<void> => {
  try {
    const { storage, bucketName } = getGCSInstances();
    const bucket = storage.bucket(bucketName);
    const prefix = `${userId}/`;

    console.log(`[GCS] Deleting all files under prefix: ${prefix}`);

    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      console.log(`[GCS] No files found under prefix: ${prefix}`);
      return;
    }

    await Promise.all(files.map((f) => f.delete()));

    console.log(`[GCS] Deleted ${files.length} file(s) for user ${userId}`);
  } catch (err) {
    console.error(
      `[GCS] Failed to delete folder for user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
};

// Create a singleton-like object for backward compatibility
export const gcsService = {
  uploadFile,
  uploadBase64Image,
  ensureUserFolderExists,
  deleteFileByUri,
  deleteUserFolder,
};
