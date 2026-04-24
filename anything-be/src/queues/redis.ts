import Redis from "ioredis";

// Configure Redis connection based on environment
export const redisConnection = new Redis(
  parseInt(process.env.REDIS_PORT || "6379", 10),
  process.env.REDIS_HOST || "localhost",
  {
    maxRetriesPerRequest: null, // Important for BullMQ
    enableReadyCheck: false,
  }
);

// Event listeners for debugging
redisConnection.on("ready", () => {
  console.log("Redis Client Ready");
});

redisConnection.on("connect", () => {
  console.log("Redis Client Connected");
});

redisConnection.on("error", (error) => {
  console.error("Redis Client Connection Error:", error);
});

redisConnection.on("reconnecting", () => {
  console.log("Redis Client Reconnecting");
});

redisConnection.on("end", () => {
  console.log("Redis Client Connection ended");
});


