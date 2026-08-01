import { Redis } from "@upstash/redis";

// Different Vercel <-> Upstash integration paths have used different env
// var names over time. We check the common ones so setup works regardless
// of which flow was used to connect the database.
const url =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  process.env.KV_URL;

const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  process.env.KV_REST_API_READ_ONLY_TOKEN;

if (!url || !token) {
  console.error(
    "[redis] Missing Upstash/KV env vars. Set UPSTASH_REDIS_REST_URL and " +
    "UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_* equivalents) in your " +
    "Vercel project's Environment Variables."
  );
}

export const redis = new Redis({ url, token });

export function missingRedisConfig() {
  return !url || !token;
}
