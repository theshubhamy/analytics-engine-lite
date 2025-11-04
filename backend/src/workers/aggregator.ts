/**
 * Aggregator worker
 * Runs hourly + daily aggregation + data retention.
 */
import mongoose from 'mongoose';
import { EventModel } from '../models/Event';
import { HourlyAggregate, DailyAggregate } from '../models/Aggregate';
import dayjs from 'dayjs';

const MONGO_URL =
  process.env.MONGO_URL || 'mongodb://localhost:27017/analytics';
await mongoose.connect(MONGO_URL);
console.log('Connected to MongoDB ✅');

// --- CONFIG ---
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 30);

// --- HOURLY AGGREGATION ---
async function aggregateHourly() {
  const now = dayjs().utc();
  const prevHour = now.subtract(1, 'hour').startOf('hour').toDate();
  const nextHour = now.startOf('hour').toDate();

  console.log(
    `[HourlyAggregate] Aggregating ${prevHour.toISOString()} → ${nextHour.toISOString()}`,
  );

  const events = await EventModel.find({
    createdAt: { $gte: prevHour, $lt: nextHour },
  });

  if (!events.length) {
    console.log('No events found for last hour.');
    return;
  }

  const pageViews: Record<string, number> = {};
  const actions: Record<string, number> = {};
  const perf: Record<string, { count: number; sum: number }> = {};

  for (const e of events) {
    const data = e.payload as any;
    if (e.type === 'pageview') {
      pageViews[data.url] = (pageViews[data.url] || 0) + 1;
    } else if (e.type === 'action') {
      const key = data.category || data.action;
      actions[key] = (actions[key] || 0) + 1;
    } else if (e.type === 'performance') {
      const m = data.metric;
      if (!perf[m]) perf[m] = { count: 0, sum: 0 };
      perf[m].count += 1;
      perf[m].sum += Number(data.value);
    }
  }

  await HourlyAggregate.updateOne(
    { hour: prevHour },
    { $set: { pageViews, actions, perf } },
    { upsert: true },
  );

  console.log('✅ Hourly aggregate updated.');
}

// --- DAILY AGGREGATION ---
async function aggregateDaily() {
  const now = dayjs().utc();
  const prevDay = now.subtract(1, 'day').startOf('day').toDate();
  const nextDay = now.startOf('day').toDate();

  console.log(
    `[DailyAggregate] Aggregating ${prevDay.toISOString()} → ${nextDay.toISOString()}`,
  );

  const hourlyDocs = await HourlyAggregate.find({
    hour: { $gte: prevDay, $lt: nextDay },
  });

  if (!hourlyDocs.length) {
    console.log('No hourly data for daily aggregation.');
    return;
  }

  const dailyPageViews: Record<string, number> = {};
  const dailyActions: Record<string, number> = {};
  const dailyPerf: Record<string, { count: number; sum: number }> = {};

  for (const h of hourlyDocs) {
    for (const [url, c] of Object.entries(h.pageViews || {}))
      dailyPageViews[url] = (dailyPageViews[url] || 0) + Number(c);

    for (const [k, c] of Object.entries(h.actions || {}))
      dailyActions[k] = (dailyActions[k] || 0) + Number(c);

    for (const [m, v] of Object.entries(h.perf || {})) {
      if (!dailyPerf[m]) dailyPerf[m] = { count: 0, sum: 0 };
      dailyPerf[m].count += v.count;
      dailyPerf[m].sum += v.sum;
    }
  }

  await DailyAggregate.updateOne(
    { day: prevDay },
    {
      $set: {
        pageViews: dailyPageViews,
        actions: dailyActions,
        perf: dailyPerf,
      },
    },
    { upsert: true },
  );

  console.log('✅ Daily aggregate updated.');
}

// --- RETENTION CLEANUP ---
async function cleanupOldEvents() {
  const cutoff = dayjs().subtract(RETENTION_DAYS, 'day').toDate();
  const deleted = await EventModel.deleteMany({ createdAt: { $lt: cutoff } });
  console.log(
    `🧹 Deleted ${deleted.deletedCount} old events (older than ${RETENTION_DAYS} days).`,
  );
}

// --- SCHEDULERS ---
function startSchedulers() {
  // Hourly every hour at :05
  setInterval(async () => {
    const minute = new Date().getUTCMinutes();
    if (minute === 5) await aggregateHourly();
  }, 60 * 1000);

  // Daily every day at 00:10 UTC
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 10)
      await aggregateDaily();
  }, 60 * 1000);

  // Retention every 24 hours
  setInterval(async () => await cleanupOldEvents(), 24 * 3600 * 1000);

  console.log('📅 Aggregator schedulers started (hourly, daily, cleanup).');
}

startSchedulers();
