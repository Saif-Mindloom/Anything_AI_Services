import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { generateAccessoriesForOutfit } from "../services/accessoryGenerationService";

// Queue Definition
export const accessoryGenerationQueue = new Queue("accessoryGeneration", {
  connection: redisConnection,
});

// Worker Definition
const accessoryGenerationWorker = new Worker(
  "accessoryGeneration",
  async (job: Job) => {
    const { outfitId, userId } = job.data;
    const startTime = Date.now();

    try {
      await job.updateProgress(5);
      await job.log(`Starting accessory generation for outfit ID: ${outfitId}`);
      console.log(
        `⏱️  Job ${job.id} started at ${new Date(startTime).toISOString()}`,
      );

      // Call the existing service function
      const generatedAccessories = await generateAccessoriesForOutfit(
        outfitId,
        userId,
      );

      const endTime = Date.now();
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

      await job.updateProgress(100);
      await job.log(
        `Successfully generated ${generatedAccessories.length} accessories`,
      );

      console.log(`⏱️  Job ${job.id} completed in ${durationSeconds}s`);

      return {
        success: true,
        message: `Successfully generated ${generatedAccessories.length} accessories`,
        durationSeconds: parseFloat(durationSeconds),
        accessories: generatedAccessories.map((acc) => ({
          id: acc.id,
          outfitId: outfitId,
          accessoryType: acc.type,
          description: acc.description,
          imageUrl: acc.imageUrl,
          gsUtil: acc.gsUtil,
          status: "complete",
        })),
      };
    } catch (error: any) {
      const endTime = Date.now();
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
      console.error(
        `❌ Error in accessory generation job for outfit ${outfitId} after ${durationSeconds}s:`,
        error,
      );
      throw new Error(error.message || "Failed to generate accessories");
    }
  },
  {
    connection: redisConnection,
    concurrency: 3, // Process 3 accessory generation jobs at a time
  },
);

// Worker Event Listeners
accessoryGenerationWorker.on("completed", (job: Job, result: any) => {
  const duration = result?.durationSeconds || 0;
  console.log(
    `✅ Accessory Generation Job ${job.id} completed for outfit ${job.data.outfitId} in ${duration}s`,
  );
});

accessoryGenerationWorker.on("failed", (job: any, err: Error) => {
  console.error(
    `❌ Accessory Generation Job ${job?.id} failed: ${err.message}`,
  );
});

accessoryGenerationWorker.on("error", (err: Error) => {
  console.error(`❌ Accessory Generation Worker error: ${err.message}`);
});

// Function to Add Jobs to Queue
export const addAccessoryGenerationJob = async (data: {
  outfitId: number;
  userId: number;
}) => {
  try {
    const job = await accessoryGenerationQueue.add(
      "generateAccessories",
      data,
      {
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
      },
    );

    console.log(
      `📋 Accessory Generation job added to queue with ID: ${job.id} for outfit ${data.outfitId}`,
    );
    return job.id;
  } catch (error) {
    console.error("Error adding accessory generation job to queue:", error);
    throw error;
  }
};
