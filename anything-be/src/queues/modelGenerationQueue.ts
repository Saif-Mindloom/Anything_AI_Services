import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { User } from "../models/index";
import { generateModelId } from "../helpers/utils";
import { gcsService } from "../services/gcsService";
import { removeBackgroundFromBase64 } from "../services/backgroundRemovalService";
import { generateModelImage } from "../services/gemini/services";
import { centerAndStandardizeImage } from "../helpers/imageUtils";

// Queue Definition
export const modelGenerationQueue = new Queue("modelGeneration", {
  connection: redisConnection,
});

// Worker Definition
const modelGenerationWorker = new Worker(
  "modelGeneration",
  async (job: Job) => {
    const {
      userId,
      bodyPhotoUrls,
      facePhotoUrls,
      height,
      weight,
      dob,
      gender,
    } = job.data;

    try {
      await job.updateProgress(5);
      await job.log(`Starting model generation for user ID: ${userId}`);

      // Validate user exists
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error("User not found");
      }

      if (!bodyPhotoUrls || bodyPhotoUrls.length < 2) {
        throw new Error("At least 2 body photos are required");
      }

      await job.updateProgress(10);
      await job.log("Downloading images from GCS...");

      // Download body photos from GCS
      const bodyPhotoBuffers = await Promise.all(
        bodyPhotoUrls.map(async (photo: any) => {
          const response = await fetch(photo.httpUrl);
          const arrayBuffer = await response.arrayBuffer();
          return {
            buffer: Buffer.from(arrayBuffer),
            originalname: photo.originalName,
            mimetype: photo.mimetype,
          };
        })
      );

      // Download face photos from GCS (if any)
      let facePhotoBuffers: any[] = [];
      if (facePhotoUrls && facePhotoUrls.length > 0) {
        facePhotoBuffers = await Promise.all(
          facePhotoUrls.map(async (photo: any) => {
            const response = await fetch(photo.httpUrl);
            const arrayBuffer = await response.arrayBuffer();
            return {
              buffer: Buffer.from(arrayBuffer),
              originalname: photo.originalName,
              mimetype: photo.mimetype,
            };
          })
        );
      }

      await job.updateProgress(20);
      await job.log("Images downloaded, generating model...");

      const modelId = generateModelId();
      const primaryBodyPhoto = bodyPhotoBuffers[0];
      const secondaryBodyPhoto = bodyPhotoBuffers[1];

      // Generate model image using Gemini
      const modelImageBase64 = await generateModelImage(
        primaryBodyPhoto.buffer,
        secondaryBodyPhoto.buffer,
        "image/jpeg",
        height,
        weight,
        gender
      );

      await job.updateProgress(60);
      await job.log("Model generated, applying background removal...");

      // Apply background removal
      let processedModelImageBase64: string;
      try {
        processedModelImageBase64 = await removeBackgroundFromBase64(
          modelImageBase64,
          { background: "transparent" }
        );
        await job.log("Background removal completed successfully");
      } catch (bgRemovalError) {
        console.warn(
          "Background removal failed, using original image:",
          bgRemovalError
        );
        processedModelImageBase64 = modelImageBase64;
      }

      // Apply centering and standardization
      await job.log("Centering and standardizing model image...");
      try {
        const base64Data = processedModelImageBase64.includes(",")
          ? processedModelImageBase64.split(",")[1]
          : processedModelImageBase64;
        const processedBuffer = Buffer.from(base64Data, "base64");
        const centeredBuffer = await centerAndStandardizeImage(
          processedBuffer,
          1024,
          1536,
          false,
        );
        processedModelImageBase64 = centeredBuffer.toString("base64");
        await job.log("Image centering completed successfully");
      } catch (centerError) {
        console.warn(
          "Image centering failed, using background-removed image:",
          centerError,
        );
      }

      await job.updateProgress(80);
      await job.log("Uploading processed model to GCS...");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const modelFileName = `model-${modelId}-${timestamp}.png`;

      const uploadResult = await gcsService.uploadBase64Image(
        processedModelImageBase64,
        modelFileName,
        userId,
        "Avatar/Processed",
        "image/png"
      );

      await job.updateProgress(90);
      await job.log("Updating user record...");

      // Build raw image URLs from the temporary uploads
      const rawImageUrls = bodyPhotoUrls.map((photo: any) => photo.httpUrl);
      const rawFaceImageUrls = facePhotoUrls
        ? facePhotoUrls.map((photo: any) => photo.httpUrl)
        : [];

      // Update user record
      await User.update(
        {
          faceImages: rawFaceImageUrls,
          bodyImages: {
            rawImageUrls: rawImageUrls,
          },
          baseModelUrl: uploadResult.httpUrl,
          ...(height && { height }),
          ...(weight && { weight }),
          ...(dob && { dob }),
          ...(gender && { gender }),
        },
        {
          where: { id: user.id },
        }
      );

      await job.updateProgress(100);
      await job.log("Model generation completed successfully");

      console.log(
        `✅ Model generation completed for user ID: ${userId}, modelId: ${modelId}`
      );

      return {
        modelId,
        modelPhoto: uploadResult.httpUrl,
        status: "Model generated and saved successfully",
      };
    } catch (error) {
      await job.log(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3, // Process 3 model generations simultaneously
  }
);

// Event Listeners
modelGenerationWorker.on("completed", (job: Job, returnValue: any) => {
  console.log(`✅ Model Generation Job ${job.id} completed successfully`);
});

modelGenerationWorker.on("failed", (job: any, err: Error) => {
  console.error(`❌ Model Generation Job ${job?.id} failed: ${err.message}`);
});

modelGenerationWorker.on("error", (err: Error) => {
  console.error(`❌ Model Generation Worker error: ${err.message}`);
});

// Function to Add Jobs to Queue
export const addModelGenerationJob = async (data: any) => {
  try {
    const job = await modelGenerationQueue.add("generateModel", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600, // Keep for 1 hour
        count: 1000, // Keep last 1000
      },
      removeOnFail: {
        age: 86400, // Keep for 24 hours
      },
    });

    console.log(`📋 Model Generation job added to queue with ID: ${job.id}`);
    return job.id;
  } catch (error) {
    console.error("Error adding model generation job to queue:", error);
    throw error;
  }
};
