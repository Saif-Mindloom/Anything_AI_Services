import express from "express";
import { getUserFromToken } from "../helpers/utils";
import { modelGenerationQueue } from "../queues/modelGenerationQueue";
import {
  clothingDetectionQueue,
  clothingDetectionBatchQueue,
} from "../queues/clothingDetectionQueue";
import { virtualTryOnQueue } from "../queues/virtualTryOnQueue";
import { angleGenerationQueue } from "../queues/angleGenerationQueue";
import { accessoryGenerationQueue } from "../queues/accessoryGenerationQueue";

const router = express.Router();

// Map of queue names to queue instances
const queues = {
  modelGeneration: modelGenerationQueue,
  clothingDetection: clothingDetectionQueue,
  clothingDetectionBatch: clothingDetectionBatchQueue,
  virtualTryOn: virtualTryOnQueue,
  angleGeneration: angleGenerationQueue,
  accessoryGeneration: accessoryGenerationQueue,
};

/**
 * Helper function to group apparels by original uploaded image
 */
function groupApparelsByOriginalImage(savedApparels: any[]) {
  const groupedByOriginalImage: Record<string, any[]> = {};

  savedApparels.forEach((apparel: any) => {
    const originalUrl = apparel.originalUploadedImageUrl || "unknown";
    if (!groupedByOriginalImage[originalUrl]) {
      groupedByOriginalImage[originalUrl] = [];
    }
    groupedByOriginalImage[originalUrl].push(apparel);
  });

  // Convert to array format for easier frontend consumption
  return Object.entries(groupedByOriginalImage).map(
    ([originalImageUrl, processedItems]) => ({
      originalImageUrl,
      processedItems,
      itemCount: processedItems.length,
    }),
  );
}

/**
 * Helper function to check if all child jobs are complete
 */
async function checkAllChildrenComplete(
  job: any,
  queueName: string | null,
): Promise<boolean> {
  // Check if this is a batch job with child jobs
  const childrenValues = await job.getChildrenValues();
  const hasChildren = childrenValues && Object.keys(childrenValues).length > 0;

  if (!hasChildren || queueName !== "clothingDetectionBatch") {
    return true; // No children or not a batch job
  }

  // For batch jobs, check if all children are actually complete
  const dependencies = await job.getDependencies();
  if (dependencies && dependencies.children) {
    for (const childKey of Object.keys(dependencies.children)) {
      const childJobId = childKey.split(":").pop();
      if (childJobId) {
        const childJob = await clothingDetectionQueue.getJob(childJobId);
        if (childJob) {
          const childState = await childJob.getState();
          if (childState !== "completed" && childState !== "failed") {
            return false; // Found a child that's not done yet
          }
        }
      }
    }
  }

  return true; // All children are complete
}

/**
 * Get job status by job ID
 * Endpoint: GET /api/job-status/:jobId
 *
 * Returns job status in format matching frontend requirements
 */
router.get("/job-status/:jobId", async (req, res) => {
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

    const { jobId } = req.params;

    // Try to find the job in all queues
    let job = null;
    let queueName = null;

    for (const [name, queue] of Object.entries(queues)) {
      const foundJob = await queue.getJob(jobId);
      if (foundJob) {
        job = foundJob;
        queueName = name;
        break;
      }
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Get job state and details
    const state = await job.getState();
    const progressValue = job.progress || 0;

    // Check if all child jobs are complete (for batch jobs)
    const allChildrenComplete = await checkAllChildrenComplete(job, queueName);

    // Map BullMQ states to frontend-expected states
    let status: "pending" | "processing" | "completed" | "failed";
    if (state === "completed" && allChildrenComplete) {
      // Only mark as completed if job is done AND all children are complete
      status = "completed";
    } else if (state === "failed") {
      status = "failed";
    } else if (
      state === "active" ||
      state === "waiting-children" ||
      (state === "completed" && !allChildrenComplete)
    ) {
      // Still processing if waiting for children or if parent is complete but children aren't
      status = "processing";
    } else {
      status = "pending";
    }

    // Build progress object
    let progress = { current: 0, total: 1 };
    if (typeof progressValue === "number") {
      // If progress is a percentage (0-100)
      progress = {
        current: Math.round(progressValue),
        total: 100,
      };
    } else if (typeof progressValue === "object" && progressValue !== null) {
      // If progress is an object with current/total
      progress = {
        current: progressValue.current || 0,
        total: progressValue.total || 1,
      };
    }

    // Build response matching requirements document format
    const response: any = {
      success: true,
      job: {
        jobId: job.id,
        status: status,
        progress: progress,
        createdAt: job.timestamp
          ? new Date(job.timestamp).toISOString()
          : new Date().toISOString(),
        updatedAt: job.processedOn
          ? new Date(job.processedOn).toISOString()
          : job.timestamp
            ? new Date(job.timestamp).toISOString()
            : new Date().toISOString(),
      },
    };

    // Calculate duration if job is completed or failed
    if (job.timestamp && (job.finishedOn || job.processedOn)) {
      const endTime = job.finishedOn || job.processedOn || Date.now();
      const durationMs = endTime - job.timestamp;
      response.job.durationSeconds = (durationMs / 1000).toFixed(2);
    }

    // Add result if completed
    if (state === "completed") {
      const returnValue = await job.returnvalue;
      const savedApparels = returnValue?.savedApparels || [];
      const imagesWithoutClothes = returnValue?.imagesWithoutClothes || [];
      const imagesWithProcessedItems =
        groupApparelsByOriginalImage(savedApparels);

      response.job.result = {
        savedApparels: savedApparels,
        failedApparels: returnValue?.failedApparels || [],
        imagesWithoutClothes: imagesWithoutClothes,
        message: returnValue?.message,
        durationSeconds: returnValue?.durationSeconds, // Include worker-reported duration
        imagesWithProcessedItems, // Grouped structure for easy frontend display
      };
    }

    // Add error if failed
    if (state === "failed") {
      response.job.error = job.failedReason || "Job failed";
    }

    return res.json(response);
  } catch (error) {
    console.error("❌ Error fetching job status:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch job status: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
});

/**
 * Get job status by job ID (Alternative path matching requirements document)
 * Endpoint: GET /api/v1/jobs/:jobId/status
 * This is an alias for the main job-status endpoint
 */
router.get("/jobs/:jobId/status", async (req, res) => {
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

    const { jobId } = req.params;

    // Try to find the job in all queues
    let job = null;
    let queueName = null;

    for (const [name, queue] of Object.entries(queues)) {
      const foundJob = await queue.getJob(jobId);
      if (foundJob) {
        job = foundJob;
        queueName = name;
        break;
      }
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Get job state and details
    const state = await job.getState();
    const progressValue = job.progress || 0;

    // Check if all child jobs are complete (for batch jobs)
    const allChildrenComplete = await checkAllChildrenComplete(job, queueName);

    // Map BullMQ states to frontend-expected states
    let status: "pending" | "processing" | "completed" | "failed";
    if (state === "completed" && allChildrenComplete) {
      // Only mark as completed if job is done AND all children are complete
      status = "completed";
    } else if (state === "failed") {
      status = "failed";
    } else if (
      state === "active" ||
      state === "waiting-children" ||
      (state === "completed" && !allChildrenComplete)
    ) {
      // Still processing if waiting for children or if parent is complete but children aren't
      status = "processing";
    } else {
      status = "pending";
    }

    // Build progress object
    let progress = { current: 0, total: 1 };
    if (typeof progressValue === "number") {
      // If progress is a percentage (0-100)
      progress = {
        current: Math.round(progressValue),
        total: 100,
      };
    } else if (typeof progressValue === "object" && progressValue !== null) {
      // If progress is an object with current/total
      progress = {
        current: progressValue.current || 0,
        total: progressValue.total || 1,
      };
    }

    // Build response matching requirements document format
    const response: any = {
      success: true,
      job: {
        jobId: job.id,
        status: status,
        progress: progress,
        createdAt: job.timestamp
          ? new Date(job.timestamp).toISOString()
          : new Date().toISOString(),
        updatedAt: job.processedOn
          ? new Date(job.processedOn).toISOString()
          : job.timestamp
            ? new Date(job.timestamp).toISOString()
            : new Date().toISOString(),
      },
    };

    // Calculate duration if job is completed or failed
    if (job.timestamp && (job.finishedOn || job.processedOn)) {
      const endTime = job.finishedOn || job.processedOn || Date.now();
      const durationMs = endTime - job.timestamp;
      response.job.durationSeconds = (durationMs / 1000).toFixed(2);
    }

    // Add result if completed
    if (state === "completed") {
      const returnValue = await job.returnvalue;
      const savedApparels = returnValue?.savedApparels || [];
      const imagesWithoutClothes = returnValue?.imagesWithoutClothes || [];
      const imagesWithProcessedItems =
        groupApparelsByOriginalImage(savedApparels);

      response.job.result = {
        savedApparels: savedApparels,
        failedApparels: returnValue?.failedApparels || [],
        imagesWithoutClothes: imagesWithoutClothes,
        message: returnValue?.message,
        durationSeconds: returnValue?.durationSeconds,
        imagesWithProcessedItems,
      };
    }

    // Add error if failed
    if (state === "failed") {
      response.job.error = job.failedReason || "Job failed";
    }

    return res.json(response);
  } catch (error) {
    console.error("❌ Error fetching job status:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch job status: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
});

/**
 * Get multiple job statuses
 * Endpoint: POST /api/job-status/bulk
 * Body: { jobIds: string[] }
 */
router.post("/job-status/bulk", async (req, res) => {
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

    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "jobIds must be a non-empty array",
      });
    }

    // Fetch all job statuses
    const results = await Promise.all(
      jobIds.map(async (jobId) => {
        try {
          // Try to find the job in all queues
          let job = null;
          let queueName = null;

          for (const [name, queue] of Object.entries(queues)) {
            const foundJob = await queue.getJob(jobId);
            if (foundJob) {
              job = foundJob;
              queueName = name;
              break;
            }
          }

          if (!job) {
            return {
              jobId,
              found: false,
              message: "Job not found",
            };
          }

          const state = await job.getState();
          const progress = job.progress || 0;

          const result: any = {
            jobId: job.id,
            queueName,
            found: true,
            status: state,
            progress,
          };

          if (state === "completed") {
            result.data = await job.returnvalue;
          } else if (state === "failed") {
            result.error = job.failedReason;
          }

          return result;
        } catch (error) {
          return {
            jobId,
            found: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("❌ Error fetching bulk job statuses:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch job statuses: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
});

export default router;
