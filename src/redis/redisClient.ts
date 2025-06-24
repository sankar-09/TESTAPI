import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // Prevent infinite retries if Redis is down
  maxRetriesPerRequest: null, // set to null to keep trying forever (optional: change to 5 or 10 if you want limit)
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000); // gradually back off
    console.warn(`Redis retry #${times}, retrying in ${delay}ms...`);
    return delay;
  },

  reconnectOnError: (err) => {
    const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
    const isReconnect = targetErrors.some((msg) => err.message.includes(msg));
    if (isReconnect) {
      console.warn("Redis reconnect triggered due to error:", err.message);
    }
    return isReconnect;
  },

  connectTimeout: 10000, // 10s timeout on initial connect
});

redis.on("connect", () => {
  console.log("Redis connected");
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

export default redis;
