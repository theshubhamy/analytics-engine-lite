// src/routes/analytics.ts
import { FastifyInstance } from 'fastify';
import { HourlyAggregate } from '../models/Aggregate';
import { redis, minuteKeyFor, hourKeyFor } from '../libs/redis';
import dayjs from 'dayjs';
import { EventModel } from '../models/Event';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  // Realtime: last 5 minutes (fast)
  app.get('/api/analytics/realtime', async (req, reply) => {
    try {
      const now = new Date();
      const last5: string[] = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 1000);
        last5.push(minuteKeyFor(d));
      }

      // Gather PVs for last 5 minutes
      const pageTotals: Record<string, number> = {};
      for (const mk of last5) {
        const h = await redis.hgetall(`${mk}:pv`);
        for (const [url, cnt] of Object.entries(h || {}))
          pageTotals[url] = (pageTotals[url] || 0) + Number(cnt);
      }

      // actions totals
      const actionTotals: Record<string, number> = {};
      for (const mk of last5) {
        const h = await redis.hgetall(`${mk}:ac`);
        for (const [k, v] of Object.entries(h || {}))
          actionTotals[k] = (actionTotals[k] || 0) + Number(v);
      }

      // EPM = events in last minute (last bucket)
      const lastMin = last5[last5.length - 1];
      let epm = 0;
      const lastMinPv = await redis.hgetall(`${lastMin}:pv`);
      for (const v of Object.values(lastMinPv)) epm += Number(v);
      const recentRaw = await redis.lrange('recent_actions', 0, 49);
      const recentActions = recentRaw
        .map(r => {
          try {
            return JSON.parse(r);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // active sessions
      const sess = await redis.smembers('active_sessions');
      let activeSessions = 0;
      if (sess.length) {
        const pipe = redis.pipeline();
        sess.forEach(s => pipe.exists(`sess_ttl:${s}`));
        const res = await pipe.exec();
        const prune: string[] = [];
        res.forEach(([_, val], idx) => {
          if (val === 1) activeSessions++;
          else prune.push(sess[idx]);
        });
        if (prune.length) {
          const p = redis.pipeline();
          prune.forEach(s => p.srem('active_sessions', s));
          await p.exec();
        }
      }

      const topPages = Object.entries(pageTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      return {
        totals: {
          pageViews: pageTotals,
          actions: actionTotals,
          activeSessions,
        },
        epm,
        topPages,
        recentActions,
      };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'internal' });
    }
  });

  // Summary: aggregated data range (hourly aggregates merged with Redis hour keys for up-to-date)
  app.get('/api/analytics/summary', async (req, reply) => {
    try {
      const q = req.query as any;
      const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - 24 * 3600 * 1000);
      const to = q.to ? new Date(q.to) : new Date();

      // Fetch hourly aggregates from Mongo for range
      const hours = await HourlyAggregate.find({
        hour: { $gte: from, $lte: to },
      })
        .lean()
        .exec();
      // also merge Redis hour counters for the to-range hours that may not have flushed yet (recent hour)
      const mergedHours = [...hours];

      // merge last N hours from Redis (for hours >= from)
      const startHr = new Date(from);
      const endHr = new Date(to);
      // iterate per-hour between start and end (caution: don't iterate huge ranges)
      const hoursDiff = Math.min(
        Math.max(
          Math.round((endHr.getTime() - startHr.getTime()) / (60 * 60 * 1000)),
          0,
        ),
        48,
      );
      for (let i = 0; i <= hoursDiff; i++) {
        const d = new Date(endHr.getTime() - i * 60 * 60 * 1000);
        const hk = hourKeyFor(d);
        const hpv = await redis.hgetall(`${hk}:pv`);
        const hac = await redis.hgetall(`${hk}:ac`);
        const hpf = await redis.hgetall(`${hk}:pf`);
        const perfObj: any = {};
        for (const [k, v] of Object.entries(hpf || {})) {
          const [metric, kind] = k.split('::');
          perfObj[metric] = perfObj[metric] || { count: 0, sum: 0 };
          if (kind === 'count') perfObj[metric].count += Number(v);
          else perfObj[metric].sum += Number(v);
        }
        // only add if there's any redis data
        if (
          Object.keys(hpv || {}).length ||
          Object.keys(hac || {}).length ||
          Object.keys(perfObj).length
        ) {
          mergedHours.push({
            hour: new Date(d.toISOString()),
            pageViews: hpv,
            actions: hac,
            perf: perfObj,
          });
        }
      }

      return { from, to, hours: mergedHours };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'internal' });
    }
  });

  app.get('/api/analytics/top-pages', async (req, reply) => {
    try {
      const q = req.query as any;
      const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - 24 * 3600 * 1000);
      const to = q.to ? new Date(q.to) : new Date();

      // Fast path: sum Redis hour keys in range (if available)
      const totals: Record<string, number> = {};
      const hrStart = new Date(from);
      const hrEnd = new Date(to);
      const hoursSpan = Math.min(
        Math.round((hrEnd.getTime() - hrStart.getTime()) / (60 * 60 * 1000)),
        168,
      ); // max 7d window
      for (let i = 0; i <= hoursSpan; i++) {
        const d = new Date(hrEnd.getTime() - i * 60 * 60 * 1000);
        const hk = hourKeyFor(d);
        const h = await redis.hgetall(`${hk}:pv`);
        for (const [url, cnt] of Object.entries(h || {}))
          totals[url] = (totals[url] || 0) + Number(cnt);
      }

      // If totals empty (cold), fallback to Mongo hourly aggregates
      if (!Object.keys(totals).length) {
        const docs = await HourlyAggregate.find({
          hour: { $gte: from, $lte: to },
        })
          .lean()
          .exec();
        for (const d of docs) {
          for (const [url, c] of Object.entries(d.pageViews || {}))
            totals[url] = (totals[url] || 0) + Number(c);
        }
      }

      const top = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      return { top };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'internal' });
    }
  });

  app.get('/api/analytics/actions', async (req, reply) => {
    try {
      // prefer Redis for last hours; fallback to Mongo if empty
      const q = req.query as any;
      const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - 24 * 3600 * 1000);
      const to = q.to ? new Date(q.to) : new Date();
      const totals: Record<string, number> = {};

      const hrStart = new Date(from);
      const hrEnd = new Date(to);
      const hoursSpan = Math.min(
        Math.round((hrEnd.getTime() - hrStart.getTime()) / (60 * 60 * 1000)),
        168,
      );

      for (let i = 0; i <= hoursSpan; i++) {
        const d = new Date(hrEnd.getTime() - i * 60 * 60 * 1000);
        const hk = hourKeyFor(d);
        const h = await redis.hgetall(`${hk}:ac`);
        for (const [k, cnt] of Object.entries(h || {}))
          totals[k] = (totals[k] || 0) + Number(cnt);
      }

      if (!Object.keys(totals).length) {
        const docs = await HourlyAggregate.find({
          hour: { $gte: from, $lte: to },
        })
          .lean()
          .exec();
        for (const d of docs) {
          for (const [k, c] of Object.entries(d.actions || {}))
            totals[k] = (totals[k] || 0) + Number(c);
        }
      }

      return { totals };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'internal' });
    }
  });

  app.get('/api/analytics/performance', async (req, reply) => {
    try {
      const q = req.query as any;
      const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - 24 * 3600 * 1000);
      const to = q.to ? new Date(q.to) : new Date();

      const metrics: Record<string, { count: number; sum: number }> = {};

      const hrStart = new Date(from);
      const hrEnd = new Date(to);
      const hoursSpan = Math.min(
        Math.round((hrEnd.getTime() - hrStart.getTime()) / (60 * 60 * 1000)),
        168,
      );

      for (let i = 0; i <= hoursSpan; i++) {
        const d = new Date(hrEnd.getTime() - i * 60 * 60 * 1000);
        const hk = hourKeyFor(d);
        const hpf = await redis.hgetall(`${hk}:pf`);
        for (const [field, val] of Object.entries(hpf || {})) {
          const [metric, kind] = field.split('::');
          metrics[metric] = metrics[metric] || { count: 0, sum: 0 };
          if (kind === 'count') metrics[metric].count += Number(val);
          else metrics[metric].sum += Number(val);
        }
      }

      if (!Object.keys(metrics).length) {
        const docs = await HourlyAggregate.find({
          hour: { $gte: from, $lte: to },
        })
          .lean()
          .exec();
        for (const d of docs) {
          for (const [m, v] of Object.entries(d.perf || {})) {
            metrics[m] = metrics[m] || { count: 0, sum: 0 };
            metrics[m].count += v.count || 0;
            metrics[m].sum += v.sum || 0;
          }
        }
      }

      const result = Object.fromEntries(
        Object.entries(metrics).map(([k, v]) => [
          k,
          { avg: v.count ? v.sum / v.count : 0, count: v.count },
        ]),
      );

      return { result };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: 'internal' });
    }
  });
}
