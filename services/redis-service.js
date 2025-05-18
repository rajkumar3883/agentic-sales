// services/redisService.js
const Redis = require("ioredis");

const redis = new Redis({
  host: "127.0.0.1", // or hostname
  port: 6379,
  // password: 'yourRedisPassword', // Uncomment if you enabled authentication
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error", err));

const setKey = async (key, value) => {
  await redis.set(key, JSON.stringify(value));
};

const getKey = async (key) => {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};

const deleteKey = async (key) => {
  await redis.del(key);
};
async function getKeysByPattern(pattern) {
  try {
    // Using the Redis KEYS command (be cautious with large datasets)
    const keys = await redisClient.keys(pattern);
    return keys;
  } catch (error) {
    console.error("Error getting keys by pattern:", error);
    return [];
  }
}

module.exports = {
  setKey,
  getKey,
  deleteKey,
  getKeysByPattern,
};
