const Redis = require("ioredis");
require("dotenv").config();

let redisClient;

const initializeRedis = async () => {
  try {
    if (process.env.REDIS_URL) {
      console.log(`Using Redis URL: ${process.env.REDIS_URL}`);
      redisClient = new Redis(process.env.REDIS_URL, {
        tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      });
    } else {
      const host = process.env.REDIS_HOST || "127.0.0.1";
      const port = Number(process.env.REDIS_PORT) || 6379;

      console.log(`Using Redis host/port: ${host}:${port}`);

      redisClient = new Redis({
        host,
        port,
        password: process.env.REDIS_PASSWORD || undefined,
        tls:
          process.env.NODE_ENV === "production" ||
          host.includes(".redis-cloud.com") ||
          host.includes(".redislabs.com")
            ? {}
            : undefined,
      });
    }

    redisClient.on("connect", () => {
      console.log("Redis connected successfully");
    });

    redisClient.on("ready", () => {
      console.log("Redis ready for commands");
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err.message);
    });

    return redisClient;
  } catch (error) {
    console.error("Redis connection failed:", error);
    throw error;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }
  return redisClient;
};

const saveSessionMessage = async (sessionId, message, role = "user") => {
  const client = getRedisClient();
  const key = `session:${sessionId}:messages`;
  const messageData = {
    id: Date.now().toString(),
    role,
    content: message,
    timestamp: new Date().toISOString(),
  };

  await client.lpush(key, JSON.stringify(messageData));
  await client.expire(key, process.env.SESSION_TTL || 86400); // default: 24h
  return messageData;
};

const getSessionMessages = async (sessionId) => {
  const client = getRedisClient();
  const key = `session:${sessionId}:messages`;
  const messages = await client.lrange(key, 0, -1);
  return messages.map((msg) => JSON.parse(msg)).reverse();
};

const clearSession = async (sessionId) => {
  const client = getRedisClient();
  const keys = await client.keys(`session:${sessionId}:*`);
  if (keys.length > 0) {
    await client.del(...keys);
  }
  return true;
};

const cacheEmbedding = async (text, embedding) => {
  const client = getRedisClient();
  const key = `embedding:${Buffer.from(text).toString("base64")}`;
  await client.setex(
    key,
    process.env.EMBEDDING_CACHE_TTL || 3600,
    JSON.stringify(embedding)
  );
};

const getCachedEmbedding = async (text) => {
  const client = getRedisClient();
  const key = `embedding:${Buffer.from(text).toString("base64")}`;
  const cached = await client.get(key);
  return cached ? JSON.parse(cached) : null;
};

module.exports = {
  initializeRedis,
  getRedisClient,
  saveSessionMessage,
  getSessionMessages,
  clearSession,
  cacheEmbedding,
  getCachedEmbedding,
};
