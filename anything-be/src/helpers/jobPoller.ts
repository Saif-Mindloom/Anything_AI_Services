import { Queue } from "bullmq";

export interface PollJobOptions {
  pollInterval?: number; // in milliseconds, default 2000
  timeout?: number; // in milliseconds, default 180000 (3 minutes)
}

export interface PollJobResult {
  success: boolean;
  status: "completed" | "failed" | "timeout";
  data?: any;
  error?: string;
  progress?: number;
}

/**
 * Poll a job until it completes, fails, or times out
 * @param queue - The BullMQ queue instance
 * @param jobId - The job ID to poll
 * @param options - Polling options (interval and timeout)
 * @returns Promise with job result
 */
export async function pollJobUntilComplete(
  queue: Queue,
  jobId: string,
  options: PollJobOptions = {}
): Promise<PollJobResult> {
  const pollInterval = options.pollInterval || 2000; // 2 seconds default
  const timeout = options.timeout || 180000; // 3 minutes default
  const startTime = Date.now();

  return new Promise(async (resolve) => {
    const poll = async () => {
      try {
        // Check if timeout exceeded
        if (Date.now() - startTime > timeout) {
          console.log(`⏱️ Job ${jobId} polling timeout after ${timeout}ms`);
          resolve({
            success: false,
            status: "timeout",
            error: "Job processing timeout. Please check job status later.",
          });
          return;
        }

        // Get job from queue
        const job = await queue.getJob(jobId);

        if (!job) {
          resolve({
            success: false,
            status: "failed",
            error: "Job not found",
          });
          return;
        }

        // Get job state
        const state = await job.getState();
        const progress = typeof job.progress === "number" ? job.progress : 0;

        console.log(`📊 Job ${jobId} status: ${state} (${progress}%)`);

        if (state === "completed") {
          // Job completed successfully
          const result = await job.returnvalue;
          resolve({
            success: true,
            status: "completed",
            data: result,
            progress: 100,
          });
        } else if (state === "failed") {
          // Job failed
          resolve({
            success: false,
            status: "failed",
            error: job.failedReason || "Job processing failed",
            progress,
          });
        } else {
          // Job still processing (waiting, active, delayed, etc.)
          // Continue polling
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        console.error(`Error polling job ${jobId}:`, error);
        resolve({
          success: false,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    // Start polling
    poll();
  });
}

/**
 * Poll multiple jobs simultaneously
 * @param jobs - Array of {queue, jobId} objects
 * @param options - Polling options
 * @returns Promise with results for all jobs
 */
export async function pollMultipleJobs(
  jobs: Array<{ queue: Queue; jobId: string }>,
  options: PollJobOptions = {}
): Promise<PollJobResult[]> {
  const promises = jobs.map(({ queue, jobId }) =>
    pollJobUntilComplete(queue, jobId, options)
  );

  return Promise.all(promises);
}
