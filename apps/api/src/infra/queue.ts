import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export function createQueue(name: string, connection: Redis) {
  return new Queue(name, { connection });
}
