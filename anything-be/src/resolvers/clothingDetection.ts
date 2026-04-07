import express from "express";
import { getUserFromToken } from "../helpers/utils";
import {
  singleImageUpload,
  multipleImageUpload,
} from "../services/fileUploadService";
import { gcsService } from "../services/gcsService";
import {
  addClothingDetectionJob,
  clothingDetectionQueue,
  addClothingDetectionBatchJob,
  clothingDetectionBatchQueue,
} from "../queues/clothingDetectionQueue";
import { pollJobUntilComplete } from "../helpers/jobPoller";
import multer from "multer";

const router = express.Router();

// Smart upload handler that accepts both single and multiple images
const smartImageUpload = (req: any, res: any, next: any) => {
  // Try multiple images first
  multipleImageUpload(req, res, (err: any) => {
    if (err) {
      // If multiple upload fails, try single image
      singleImageUpload(req, res, (singleErr: any) => {
        if (singleErr) {
          return res.status(400).json({
            success: false,
            message: `File upload error: ${
              singleErr instanceof Error ? singleErr.message : "Unknown error"
            }`,
          });
        }
        next();
      });
    } else {
      next();
    }
  });
};

// ============================================
// ASYNC ENDPOINT - Returns Job ID Immediately
// ============================================

/**
 * Async clothing detection endpoint
 * Accepts multiple images and returns job ID immediately (within 1-2 seconds)
 * Frontend can poll /api/job-status/:jobId to check progress
 *
 * Endpoint: POST /detect-and-crop-clothing/async
 */
router.post(
  "/detect-and-crop-clothing/async",
  smartImageUpload,
  async (req, res) => {
    const addItemsApiStart = Date.now();
    try {
      // Authentication
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authentication required. Please provide a valid token.",
        });
      }

      const token = authHeader.substring(7);
      const userFromToken = await getUserFromToken(token);

      if (!userFromToken) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      const userId = userFromToken.userId.toString();

      // Detect if single or multiple images were uploaded
      const files = req.files as Express.Multer.File[] | undefined;
      const file = req.file as Express.Multer.File | undefined;

      let uploadedFiles: Express.Multer.File[] = [];
      console.log(
        `🔍 Checking uploaded files for async endpoint...`,
        uploadedFiles,
      );

      if (files && Array.isArray(files) && files.length > 0) {
        uploadedFiles = files;
      } else if (file) {
        uploadedFiles = [file];
      } else {
        return res.status(400).json({
          success: false,
          message:
            "No image file(s) uploaded. Please provide at least one image file.",
        });
      }

      // Validate file count (1-10)
      if (uploadedFiles.length > 10) {
        return res.status(400).json({
          success: false,
          message: "Maximum 10 images allowed per upload.",
        });
      }

      // Validate all files are images
      for (const uploadedFile of uploadedFiles) {
        if (!uploadedFile.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: `Invalid file type for ${uploadedFile.originalname}. Please upload only image files.`,
          });
        }
      }

      console.log(
        `\n🚀 [ASYNC] Starting clothing detection for user: ${userId} (${uploadedFiles.length} image(s))`,
      );
      console.log(`📋 [UPLOAD] Files received from frontend:`);
      uploadedFiles.forEach((f, idx) => {
        console.log(`   [${idx + 1}] Filename: ${f.originalname}`);
        console.log(`       MIME type: ${f.mimetype}`);
        console.log(`       Size: ${(f.size / 1024).toFixed(2)} KB`);
        console.log(
          `       Extension: ${f.originalname.split(".").pop()?.toLowerCase()}`,
        );
      });

      // Upload all files to GCS
      console.log(`📤 Uploading ${uploadedFiles.length} image(s) to GCS...`);
      const gcsPhaseStart = Date.now();
      await gcsService.ensureUserFolderExists(userId);

      const imageUrls: Array<{
        url: string;
        fileName: string;
        mimetype: string;
      }> = [];

      const uploadResults = await Promise.all(
        uploadedFiles.map(async (uploadedFile) => {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `temp-clothing-${timestamp}-${uploadedFile.originalname}`;

          const uploadResult = await gcsService.uploadFile(
            uploadedFile.buffer,
            fileName,
            userId,
            "Clothing/Temp",
            uploadedFile.mimetype,
          );

          return {
            url: uploadResult.httpUrl,
            fileName: uploadedFile.originalname,
            mimetype: uploadedFile.mimetype,
          };
        }),
      );
      imageUrls.push(...uploadResults);
      const tGcsUploadMs = Date.now() - gcsPhaseStart;

      console.log(`✅ All images uploaded to GCS`);

      // Create job and return immediately
      let jobId: string;
      const enqueueStart = Date.now();

      if (uploadedFiles.length === 1) {
        // Single image
        jobId = await addClothingDetectionJob({
          userId: userId,
          imageUrl: imageUrls[0].url,
          originalFileName: imageUrls[0].fileName,
          mimetype: imageUrls[0].mimetype,
        });
      } else {
        // Multiple images - use batch queue
        jobId = await addClothingDetectionBatchJob({
          userId: userId,
          imageUrls: imageUrls,
        });
      }
      const tEnqueueMs = Date.now() - enqueueStart;
      const addItemsApiTotalMs = Date.now() - addItemsApiStart;
      const mode =
        uploadedFiles.length === 1 ? "single_queue" : "batch_queue";
      console.log(
        `📊 Add-items API (async): user=${userId} images=${uploadedFiles.length} mode=${mode} t_gcs_upload_ms=${tGcsUploadMs} t_enqueue_ms=${tEnqueueMs} total_ms=${addItemsApiTotalMs} jobId=${jobId}`,
      );

      console.log(
        `✅ [ASYNC] Job created with ID: ${jobId} (${uploadedFiles.length} image(s))`,
      );

      // Return job ID immediately (within 1-2 seconds)
      return res.status(202).json({
        success: true,
        jobId: jobId,
        message: `Job created successfully. Processing ${
          uploadedFiles.length
        } image${uploadedFiles.length > 1 ? "s" : ""}.`,
      });
    } catch (error) {
      console.error("❌ Error in async clothing detection:", error);
      return res.status(500).json({
        success: false,
        message: `Failed to create job: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  },
);

export default router;
