import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis-instance", // docker container name
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  maxRetriesPerRequest: 5, // safer than null: prevents infinite blocking if Redis is down
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 2000); // exponential backoff
    console.warn(`Redis retry #${times}, retrying in ${delay}ms...`);
    return delay;
  },

  reconnectOnError: (err) => {
    const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"];
    const isReconnect = targetErrors.some((msg) => err.message.includes(msg));
    if (isReconnect) {
      console.warn("Redis reconnect triggered due to error:", err.message);
    }
    return isReconnect;
  },

  connectTimeout: 10000, // 10 seconds
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

export default redis;
