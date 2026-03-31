import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { ClothingDetectionCropService } from "../services/clothingDetectionCropService";
import { isolateClothingItems } from "../services/clothingIsolationService";
import { bulkCreateApparelsFromCroppedItems } from "../services/apparelService";

// Queue Definition
export const clothingDetectionQueue = new Queue("clothingDetection", {
  connection: redisConnection,
});

// Worker Definition
const clothingDetectionWorker = new Worker(
  "clothingDetection",
  async (job: Job) => {
    const { userId, imageUrl, originalFileName, mimetype } = job.data;

    try {
      console.log(`\n🔵 [WORKER START] Job ${job.id} beginning processing`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Image URL: ${imageUrl}`);
      console.log(`   Original filename: ${originalFileName}`);
      console.log(`   MIME type: ${mimetype}`);

      await job.updateProgress({ current: 5, total: 100 });
      await job.log(`Starting clothing detection for user: ${userId}`);
      await job.log(`File: ${originalFileName} (${mimetype})`);

      // Download image from HTTP URL
      await job.log(`Downloading image from: ${imageUrl}`);
      console.log(`📥 [WORKER] Fetching image from GCS...`);

      const response = await fetch(imageUrl);

      if (!response.ok) {
        console.error(
          `❌ [WORKER] Failed to download image: ${response.status} ${response.statusText}`,
        );
        throw new Error(
          `Failed to download image from ${imageUrl}: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      console.log(
        `✅ [WORKER] Image downloaded successfully (${(imageBuffer.length / 1024).toFixed(2)} KB)`,
      );
      await job.log(
        `Downloaded image: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
      );

      // Create a file-like object for the service
      const file = {
        buffer: imageBuffer,
        originalname: originalFileName,
        mimetype: mimetype,
        size: imageBuffer.length,
      } as Express.Multer.File;

      await job.updateProgress({ current: 10, total: 100 });
      await job.log("Detecting and cropping clothing items...");
      console.log(`🔍 [WORKER] Starting Clarifai detection...`);

      // Step 1: Detect and crop clothing items
      const detectionStartTime = Date.now();
      const clothingService = new ClothingDetectionCropService();
      const detectionResult =
        await clothingService.detectAndCropClothingFromFile(file, userId);
      const detectionDuration = Date.now() - detectionStartTime;

      console.log(
        `⏱️  [WORKER] Detection completed in ${(detectionDuration / 1000).toFixed(2)}s`,
      );
      console.log(`📊 [WORKER] Detection results:`);
      console.log(`   Success: ${detectionResult.success}`);
      console.log(`   Total regions: ${detectionResult.totalRegions}`);
      console.log(`   Cropped images: ${detectionResult.croppedImages.length}`);
      console.log(`   Message: ${detectionResult.message}`);
      await job.log(
        `Detection found ${detectionResult.croppedImages.length} items in ${(detectionDuration / 1000).toFixed(2)}s`,
      );

      if (
        !detectionResult.success ||
        detectionResult.croppedImages.length === 0
      ) {
        console.log(`⚠️  [WORKER] No items detected, ending job`);
        await job.log("No clothing items detected");

        const workerReturn = {
          success: true,
          message: detectionResult.message || "No clothing items detected",
          savedApparels: [],
          failedApparels: [],
          imagesWithoutClothes: [
            {
              imageUrl: imageUrl,
              fileName: originalFileName,
              reason: detectionResult.message || "No clothing items detected",
            },
          ],
        };

        console.log(
          `\n🎁 [WORKER] Returning from early exit (no items detected):`,
        );
        console.log(JSON.stringify(workerReturn, null, 2));

        return workerReturn;
      }

      await job.updateProgress({ current: 40, total: 100 });
      await job.log(
        `Detected ${detectionResult.croppedImages.length} items, starting isolation...`,
      );

      // Filter out accessories BEFORE isolation to save API calls
      const { isAccessoryItem } = await import("../services/apparelService");
      const nonAccessoryItems = detectionResult.croppedImages.filter((item) => {
        const isAccessory = isAccessoryItem(item.conceptName);
        if (isAccessory) {
          console.log(
            `⏭️  [PRE-FILTER] Skipping accessory BEFORE isolation: ${item.conceptName} (region ${item.regionId})`,
          );
        }
        return !isAccessory;
      });

      console.log(
        `\n🔍 [PRE-FILTER] Filtered ${detectionResult.croppedImages.length} items → ${nonAccessoryItems.length} non-accessories`,
      );
      console.log(
        `   💰 Saved ${detectionResult.croppedImages.length - nonAccessoryItems.length} unnecessary isolation API calls`,
      );
      await job.log(
        `Filtered to ${nonAccessoryItems.length} non-accessory items for isolation`,
      );

      if (nonAccessoryItems.length === 0) {
        console.log(
          `⚠️  [PRE-FILTER] All items were accessories, skipping isolation`,
        );
        console.log(
          "⚠️  [PRE-FILTER] All items were accessories, skipping isolation",
        );
        await job.log("All detected items were accessories, nothing to save");
        return {
          success: true,
          message: "All detected items were accessories",
          savedApparels: [],
          failedApparels: [],
          imagesWithoutClothes: [
            {
              imageUrl: imageUrl,
              fileName: originalFileName,
              reason: "All detected items were accessories",
            },
          ],
        };
      }

      // Step 2: Use AI to isolate clothing items (only non-accessories)
      console.log(
        `🎨 [WORKER] Starting Gemini isolation for ${nonAccessoryItems.length} items...`,
      );
      const isolationStartTime = Date.now();
      const isolationResult = await isolateClothingItems(
        nonAccessoryItems,
        userId,
        detectionResult.originalFileName,
      );
      const isolationDuration = Date.now() - isolationStartTime;

      console.log(
        `⏱️  [WORKER] Isolation completed in ${(isolationDuration / 1000).toFixed(2)}s`,
      );
      console.log(`📊 [WORKER] Isolation results:`);
      console.log(`   Success: ${isolationResult.success}`);
      console.log(`   Total processed: ${isolationResult.totalProcessed}`);
      console.log(`   Isolated items: ${isolationResult.isolatedItems.length}`);
      console.log(
        `   Successful: ${isolationResult.isolatedItems.filter((i) => i.success).length}`,
      );
      await job.log(
        `Isolation created ${isolationResult.isolatedItems.filter((i) => i.success).length} items in ${(isolationDuration / 1000).toFixed(2)}s`,
      );

      if (
        !isolationResult.success ||
        isolationResult.isolatedItems.length === 0
      ) {
        console.log(`⚠️  [WORKER] No items could be isolated, ending job`);
        await job.log("No clothing items could be isolated");
        return {
          success: true,
          message:
            isolationResult.message || "No clothing items could be isolated",
          savedApparels: [],
          failedApparels: [],
          imagesWithoutClothes: [
            {
              imageUrl: imageUrl,
              fileName: originalFileName,
              reason:
                isolationResult.message ||
                "No clothing items could be isolated",
            },
          ],
        };
      }

      await job.updateProgress({ current: 80, total: 100 });
      await job.log(
        `Isolated ${
          isolationResult.isolatedItems.filter((item) => item.success).length
        } items, saving to database...`,
      );

      // Step 3: Save isolated items to database
      console.log(
        `\n📦 [WORKER] Calling bulkCreateApparelsFromCroppedItems with ${detectionResult.croppedImages.length} cropped images and ${isolationResult.isolatedItems.length} isolated items...`,
      );

      const savedResult = await bulkCreateApparelsFromCroppedItems(
        detectionResult.croppedImages,
        parseInt(userId),
        isolationResult.isolatedItems,
        imageUrl, // Pass the original uploaded image URL
      );

      console.log(`\n📊 [WORKER] bulkCreateApparelsFromCroppedItems returned:`);
      console.log(`   Success count: ${savedResult.success?.length || 0}`);
      console.log(`   Failed count: ${savedResult.failed?.length || 0}`);
      console.log(
        `   Success items: ${savedResult.success?.map((a) => `${a.id}:${a.description}`).join(", ") || "none"}`,
      );

      await job.updateProgress({ current: 100, total: 100 });
      await job.log(
        `Clothing detection completed: ${savedResult.success.length} items saved`,
      );

      console.log(
        `✅ [WORKER] Clothing detection completed for user ${userId}: ${
          savedResult.success?.length || 0
        } items saved`,
      );

      const returnValue = {
        success: true,
        message: `Clothing detection completed. ${savedResult.success.length} items saved to database.`,
        savedApparels: savedResult.success,
        failedApparels: savedResult.failed,
        imagesWithoutClothes:
          savedResult.success.length === 0
            ? [
                {
                  imageUrl: imageUrl,
                  fileName: originalFileName,
                  reason: "No valid clothing items could be saved to database",
                },
              ]
            : [],
      };

      console.log(`\n🎁 [WORKER] Returning value from worker:`);
      console.log(
        `   savedApparels count: ${returnValue.savedApparels?.length || 0}`,
      );
      console.log(
        `   savedApparels IDs: ${returnValue.savedApparels?.map((a) => a.id).join(", ") || "none"}`,
      );
      console.log(
        `   imagesWithoutClothes count: ${returnValue.imagesWithoutClothes?.length || 0}`,
      );

      return returnValue;
    } catch (error) {
      console.error(`\n❌ [WORKER ERROR] Job ${job.id} failed:`);
      console.error(
        `   Error message: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.error(
        `   Error stack:`,
        error instanceof Error ? error.stack : error,
      );
      console.error(`   Job data:`, JSON.stringify(job.data, null, 2));

      await job.log(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      await job.log(
        `Stack: ${error instanceof Error ? error.stack : "No stack trace"}`,
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

// Event Listeners
clothingDetectionWorker.on("completed", (job: Job, returnValue: any) => {
  console.log(`✅ Clothing Detection Job ${job.id} completed successfully`);
});

clothingDetectionWorker.on("failed", (job: any, err: Error) => {
  console.error(`❌ Clothing Detection Job ${job?.id} failed: ${err.message}`);
});

clothingDetectionWorker.on("error", (err: Error) => {
  console.error(`❌ Clothing Detection Worker error: ${err.message}`);
});

// Function to Add Jobs to Queue
export const addClothingDetectionJob = async (data: any) => {
  try {
    const job = await clothingDetectionQueue.add("detectClothing", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 86400,
      },
    });

    console.log(`📋 Clothing Detection job added to queue with ID: ${job.id}`);
    return job.id;
  } catch (error) {
    console.error("Error adding clothing detection job to queue:", error);
    throw error;
  }
};

// ============================================
// BATCH PROCESSING FOR MULTIPLE IMAGES
// ============================================

// Batch Queue Definition
export const clothingDetectionBatchQueue = new Queue("clothingDetectionBatch", {
  connection: redisConnection,
});

// Batch Worker Definition
const clothingDetectionBatchWorker = new Worker(
  "clothingDetectionBatch",
  async (job: Job) => {
    const { userId, imageUrls } = job.data;
    const totalImages = imageUrls.length;

    try {
      await job.updateProgress({ current: 0, total: totalImages });
      await job.log(
        `Starting batch clothing detection for ${totalImages} images (user: ${userId})`,
      );

      const childJobIds: string[] = [];
      const allResults = {
        savedApparels: [] as any[],
        failedApparels: [] as any[],
        imagesWithoutClothes: [] as any[],
      };
      let processedCount = 0;

      // Create child jobs for each image
      await job.log(`Creating ${totalImages} child jobs...`);
      for (const imageData of imageUrls) {
        const childJobId = await addClothingDetectionJob({
          userId,
          imageUrl: imageData.url,
          originalFileName: imageData.fileName,
          mimetype: imageData.mimetype,
        });
        childJobIds.push(childJobId);
      }

      await job.log(`✅ Created ${childJobIds.length} child jobs`);

      // Process each child job and aggregate results
      for (let i = 0; i < childJobIds.length; i++) {
        const childJobId = childJobIds[i];
        const imageFileName = imageUrls[i].fileName;

        await job.log(
          `Processing image ${i + 1}/${totalImages}: ${imageFileName}`,
        );

        try {
          // Wait for child job to complete
          const childJob = await clothingDetectionQueue.getJob(childJobId);
          if (!childJob) {
            throw new Error(`Child job ${childJobId} not found`);
          }

          // Poll child job until completion with longer timeout for complex processing
          let attempts = 0;
          const maxAttempts = 150; // 5 minutes (2 seconds * 150 = 300 seconds)
          let childResult: any = null;

          await job.log(
            `⏳ Waiting for child job ${childJobId} to complete...`,
          );

          while (attempts < maxAttempts) {
            // Refetch the job to get the latest state and data
            const freshChildJob =
              await clothingDetectionQueue.getJob(childJobId);
            if (!freshChildJob) {
              throw new Error(`Child job ${childJobId} disappeared`);
            }

            const state = await freshChildJob.getState();

            if (state === "completed") {
              // IMPORTANT: Wait a moment to ensure returnvalue is fully populated
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Refetch one more time to get the complete return value
              const finalChildJob =
                await clothingDetectionQueue.getJob(childJobId);
              if (!finalChildJob) {
                throw new Error(
                  `Child job ${childJobId} disappeared after completion`,
                );
              }

              childResult = finalChildJob.returnvalue;
              await job.log(
                `📦 Child job ${childJobId} completed, got result with ${
                  childResult?.savedApparels?.length || 0
                } apparels`,
              );
              break;
            } else if (state === "failed") {
              const failedReason =
                freshChildJob.failedReason || "Unknown error";
              throw new Error(`Child job failed: ${failedReason}`);
            } else if (state === "waiting" || state === "delayed") {
              await job.log(
                `⏸️  Child job ${childJobId} is waiting (attempt ${attempts + 1}/${maxAttempts})`,
              );
            } else if (state === "active") {
              await job.log(
                `🔄 Child job ${childJobId} is actively processing (attempt ${attempts + 1}/${maxAttempts})`,
              );
            }

            // Wait 5 seconds before next check - less Redis load
            await new Promise((resolve) => setTimeout(resolve, 5000));
            attempts++;
          }

          if (!childResult) {
            throw new Error(
              `Child job ${childJobId} timed out after ${maxAttempts * 2} seconds`,
            );
          }

          // Validate result structure
          if (!childResult || typeof childResult !== "object") {
            throw new Error(`Child job ${childJobId} returned invalid result`);
          }

          console.log(`\n📦 [BATCH] Child job ${childJobId} result structure:`);
          console.log(`   success: ${childResult.success}`);
          console.log(
            `   savedApparels: ${childResult.savedApparels ? `array with ${childResult.savedApparels.length} items` : "undefined/null"}`,
          );
          console.log(
            `   failedApparels: ${childResult.failedApparels ? `array with ${childResult.failedApparels.length} items` : "undefined/null"}`,
          );
          console.log(`   message: ${childResult.message}`);

          // Aggregate results
          if (childResult.success) {
            const childApparels = childResult.savedApparels || [];
            const childFailed = childResult.failedApparels || [];
            const childImagesWithoutClothes =
              childResult.imagesWithoutClothes || [];

            console.log(`📊 [BATCH] Aggregating results from image ${i + 1}:`);
            console.log(`   Child apparels count: ${childApparels.length}`);
            console.log(
              `   Child apparels IDs: ${childApparels.map((a: any) => a.id).join(", ") || "none"}`,
            );
            console.log(`   Child failed count: ${childFailed.length}`);
            console.log(
              `   Child imagesWithoutClothes count: ${childImagesWithoutClothes.length}`,
            );
            console.log(
              `   Current total before adding: ${allResults.savedApparels.length}`,
            );

            await job.log(
              `📊 Aggregating results from image ${i + 1}: ${
                childApparels.length
              } saved, ${childFailed.length} failed, ${childImagesWithoutClothes.length} without clothes`,
            );

            allResults.savedApparels.push(...childApparels);
            allResults.failedApparels.push(...childFailed);
            allResults.imagesWithoutClothes.push(...childImagesWithoutClothes);

            console.log(
              `   Current total after adding: ${allResults.savedApparels.length}`,
            );

            await job.log(
              `✅ Image ${i + 1}/${totalImages} completed: ${
                childApparels.length
              } items saved. Total so far: ${allResults.savedApparels.length}`,
            );
          } else {
            await job.log(
              `⚠️ Image ${
                i + 1
              }/${totalImages} completed but returned no items (success=false)`,
            );
            // Track as failed if no items were detected
            allResults.failedApparels.push({
              fileName: imageFileName,
              error: childResult.message || "No items detected",
            });
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          await job.log(`❌ Image ${i + 1}/${totalImages} failed: ${errorMsg}`);
          allResults.failedApparels.push({
            fileName: imageFileName,
            error: errorMsg,
          });
        }

        // Update progress after each image is fully processed
        processedCount++;
        await job.updateProgress({
          current: processedCount,
          total: totalImages,
        });

        await job.log(
          `📈 Progress: ${processedCount}/${totalImages} images processed (${Math.round(
            (processedCount / totalImages) * 100,
          )}%)`,
        );
      }

      // Final verification - ensure we processed all images
      if (processedCount !== totalImages) {
        await job.log(
          `⚠️  Warning: Expected ${totalImages} images but only processed ${processedCount}`,
        );
      }

      await job.log(
        `✅ Batch processing completed: ${allResults.savedApparels.length} items saved, ${allResults.failedApparels.length} failed, ${allResults.imagesWithoutClothes.length} without clothes`,
      );

      // Final log with complete summary
      await job.log(
        `📋 Final Summary: ${processedCount} images processed, ${allResults.savedApparels.length} items created, ${allResults.failedApparels.length} failures, ${allResults.imagesWithoutClothes.length} images without clothes`,
      );

      return {
        success: true,
        message: `Batch processing completed successfully. ${allResults.savedApparels.length} items saved from ${processedCount} images.`,
        savedApparels: allResults.savedApparels,
        failedApparels: allResults.failedApparels,
        imagesWithoutClothes: allResults.imagesWithoutClothes,
        totalImages,
        processedImages: processedCount,
      };
    } catch (error) {
      await job.log(
        `❌ Batch Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one batch at a time
  },
);

// Batch Event Listeners
clothingDetectionBatchWorker.on("completed", (job: Job, returnValue: any) => {
  console.log(
    `✅ Batch Clothing Detection Job ${job.id} completed: ${returnValue.savedApparels?.length} total items saved`,
  );
});

clothingDetectionBatchWorker.on("failed", (job: any, err: Error) => {
  console.error(
    `❌ Batch Clothing Detection Job ${job?.id} failed: ${err.message}`,
  );
});

clothingDetectionBatchWorker.on("error", (err: Error) => {
  console.error(`❌ Batch Clothing Detection Worker error: ${err.message}`);
});

// Function to Add Batch Job to Queue
export const addClothingDetectionBatchJob = async (data: {
  userId: string;
  imageUrls: Array<{ url: string; fileName: string; mimetype: string }>;
}) => {
  try {
    const job = await clothingDetectionBatchQueue.add(
      "detectClothingBatch",
      data,
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    );

    console.log(
      `📋 Batch Clothing Detection job added to queue with ID: ${job.id} (${data.imageUrls.length} images)`,
    );
    return job.id;
  } catch (error) {
    console.error("Error adding batch clothing detection job to queue:", error);
    throw error;
  }
};
