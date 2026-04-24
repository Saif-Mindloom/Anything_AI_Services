import Redis from "ioredis";

const redisClusterModeEnabled =
  (process.env.REDIS_CLUSTER_MODE || "false").toLowerCase() === "true";
const redisTlsEnabled = (process.env.REDIS_TLS || "false").toLowerCase() === "true";
const redisTlsRejectUnauthorized =
  (process.env.REDIS_TLS_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true";
const redisPassword = process.env.REDIS_PASSWORD;
const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

const redisOptions = {
  maxRetriesPerRequest: null, // Important for BullMQ
  enableReadyCheck: false,
  password: redisPassword || undefined,
  ...(redisTlsEnabled
    ? {
        tls: {
          servername: redisHost,
          rejectUnauthorized: redisTlsRejectUnauthorized,
        },
      }
    : {}),
};

// Configure Redis connection based on environment
export const redisConnection = redisClusterModeEnabled
  ? new Redis.Cluster([{ host: redisHost, port: redisPort }], {
      // Keep AWS ElastiCache hostnames intact for stable TLS/SNI during slot refresh.
      dnsLookup: (address, callback) => callback(null, address),
      slotsRefreshTimeout: 10000,
      slotsRefreshInterval: 5000,
      redisOptions,
    })
  : new Redis(redisPort, redisHost, redisOptions);

// Event listeners for debugging
redisConnection.on("ready", () => {
  console.log(
    `Redis Client Ready (${redisClusterModeEnabled ? "cluster" : "standalone"})`
  );
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


