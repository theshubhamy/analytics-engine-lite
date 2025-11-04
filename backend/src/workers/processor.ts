// src/workers/processor.ts
import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { EventModel } from '../models/Event';
import { SessionModel } from '../models/Session';
import { redis, minuteKeyFor, hourKeyFor, expireIfNew } from '../libs/redis';

await mongoose.connect(
  process.env.MONGO_URL || 'mongodb://localhost:27017/analytics',
  {},
);

const worker = new Worker(
  'events',
  async (job: Job) => {
    const { type, event } = job.data as any;
    const ts = event.timestamp ? new Date(event.timestamp) : new Date();

    // Idempotency: if eventId present, skip duplicates
    if (event.eventId) {
      const found = await EventModel.findOne({ eventId: event.eventId })
        .lean()
        .exec();
      if (found) return { skipped: true };
    }

    // Save raw event
    await EventModel.create({
      eventId: event.eventId,
      type,
      payload: event,
      sessionId: event.sessionId,
      createdAt: ts,
    });

    // Upsert session lastSeen
    if (event.sessionId) {
      await SessionModel.updateOne(
        { sessionId: event.sessionId },
        { $set: { lastSeen: ts } },
        { upsert: true },
      ).exec();

      // maintain active_sessions set + TTL key for pruning
      await redis.sadd('active_sessions', event.sessionId);
      await redis.set(`sess_ttl:${event.sessionId}`, '1', 'EX', 60 * 10); // 10m TTL
    }

    // Redis counters (minute & hour) with expiries
    const minKey = minuteKeyFor(ts); // e.g., min:2025-11-04T10:59
    const hrKey = hourKeyFor(ts); // e.g., hour:2025-11-04T10

    if (type === 'pageview') {
      const url = event.url || 'unknown';
      await redis.hincrby(`${minKey}:pv`, url, 1);
      await redis.hincrby(`${hrKey}:pv`, url, 1);
      await expireIfNew(`${minKey}:pv`);
      await expireIfNew(`${hrKey}:pv`, 60 * 60 * 24 * 7); // keep hour keys longer (7 days)
    } else if (type === 'action') {
      const k = event.category || event.action || 'unknown';
      await redis.hincrby(`${minKey}:ac`, k, 1);
      await redis.hincrby(`${hrKey}:ac`, k, 1);
      await expireIfNew(`${minKey}:ac`);
      await expireIfNew(`${hrKey}:ac`, 60 * 60 * 24 * 7);
      // push recent action to a bounded list for feed
      const payload = JSON.stringify({
        action: event.action,
        category: event.category,
        label: event.label || null,
        ts: ts.toISOString(),
        sessionId: event.sessionId,
      });
      await redis.lpush('recent_actions', payload);
      await redis.ltrim('recent_actions', 0, 499); // keep last 500
      await expireIfNew('recent_actions', 60 * 60 * 24 * 7);
    } else if (type === 'performance') {
      const metric = event.metric || 'metric';
      const val = Number(event.value || 0);
      // store fields as metric::count and metric::sum
      await redis.hincrby(`${minKey}:pf`, `${metric}::count`, 1);
      await redis.hincrbyfloat(`${minKey}:pf`, `${metric}::sum`, val);
      await redis.hincrby(`${hrKey}:pf`, `${metric}::count`, 1);
      await redis.hincrbyfloat(`${hrKey}:pf`, `${metric}::sum`, val);
      await expireIfNew(`${minKey}:pf`);
      await expireIfNew(`${hrKey}:pf`, 60 * 60 * 24 * 7);
    }

    return { ok: true };
  },
  { connection: redis },
);

worker.on('completed', job => console.log('processed job', job.id));
worker.on('failed', (job, err) => console.error('job failed', job?.id, err));
console.log('processor worker started');
