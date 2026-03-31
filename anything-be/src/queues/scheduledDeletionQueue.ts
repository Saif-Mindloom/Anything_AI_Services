import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { processDueForDeletion } from "../services/userDeletionService";

const QUEUE_NAME = "scheduledUserDeletion";

// Repeatable job name — used to identify and manage the single recurring job
const REPEATABLE_JOB_NAME = "processScheduledDeletions";

// Queue Definition
export const scheduledDeletionQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
});

// Worker — runs every time the repeatable job fires
const scheduledDeletionWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`[ScheduledDeletion] Worker triggered at ${new Date().toISOString()}`);
    const deleted = await processDueForDeletion();
    return { deleted, processedAt: new Date().toISOString() };
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

scheduledDeletionWorker.on("completed", (job: Job, result: any) => {
  console.log(
    `[ScheduledDeletion] Job ${job.id} completed — deleted ${result.deleted} user(s)`
  );
});

scheduledDeletionWorker.on("failed", (job: any, err: Error) => {
  console.error(`[ScheduledDeletion] Job ${job?.id} failed: ${err.message}`);
});

scheduledDeletionWorker.on("error", (err: Error) => {
  console.error(`[ScheduledDeletion] Worker error: ${err.message}`);
});

/**
 * Register the repeatable daily job that checks for users due for deletion.
 * Safe to call multiple times — BullMQ deduplicates by jobId.
 */
export const startScheduledDeletionJob = async (): Promise<void> => {
  // Remove any stale repeatable jobs before registering (idempotent start-up)
  const existing = await scheduledDeletionQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === REPEATABLE_JOB_NAME) {
      await scheduledDeletionQueue.removeRepeatableByKey(job.key);
      console.log("[ScheduledDeletion] Removed stale repeatable job");
    }
  }

  await scheduledDeletionQueue.add(
    REPEATABLE_JOB_NAME,
    {},
    {
      repeat: {
        // Run every day at midnight UTC
        pattern: "0 0 * * *",
      },
      jobId: REPEATABLE_JOB_NAME,
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 30 },
    }
  );

  console.log("[ScheduledDeletion] Daily deletion job registered (cron: 0 0 * * *)");
};
