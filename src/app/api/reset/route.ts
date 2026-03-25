import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export async function POST() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return NextResponse.json({ message: "No Redis configured, in-memory store resets on restart" });
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  await redis.flushdb();
  return NextResponse.json({ message: "Redis flushed. All data cleared." });
}
