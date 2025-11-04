import { Queue as BullQueue } from 'bullmq';
import IORedis from 'ioredis';

export class Queue {
  static redis: IORedis;
  static queue: BullQueue;

  static async init() {
    const connection = new IORedis(
      process.env.REDIS_URL || 'redis://localhost:6379',
    );
    this.redis = connection;
    this.queue = new BullQueue('events', { connection });
  }
}
