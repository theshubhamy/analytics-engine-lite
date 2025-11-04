// src/utils/realtimeEmitter.ts
import { Server as IOServer } from 'socket.io';
import { redis, minuteKeyFor } from '../libs/redis';
import dayjs from 'dayjs';
import { HourlyAggregate } from '../models/Aggregate';
import { EventModel } from '../models/Event';

/**
 * Merged realtime emitter:
 * - Reads Redis minute buckets for last 5 minutes (fast)
 * - Optionally merges small historical lookups from Mongo if Redis doesn't have enough data
 * - Emits only diffs every 5s on 'metrics:diff'
 */
export function startRealtimeEmitter(io: IOServer) {
  let lastSnapshot: any = {
    epm: 0,
    topPages: [],
    actions: {},
    activeSessions: 0,
    recentActionsFirstTs: null,
  };

  async function lastNMinuteKeys(n = 5) {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const ts = dayjs().utc().subtract(i, 'minute').toDate();
      out.push(minuteKeyFor(ts));
    }
    return out;
  }

  async function computeSnapshot() {
    const minuteKeys = await lastNMinuteKeys(5);
    // compute epm = last minute total events
    const lastMin = minuteKeys[minuteKeys.length - 1];
    let epm = 0;
    const hLast = await redis.hgetall(`${lastMin}:pv`);
    for (const v of Object.values(hLast || {})) epm += Number(v);

    // topPages aggregated across last 5 minutes
    const pageTotals: Record<string, number> = {};
    for (const mk of minuteKeys) {
      const h = await redis.hgetall(`${mk}:pv`);
      for (const [k, v] of Object.entries(h || {}))
        pageTotals[k] = (pageTotals[k] || 0) + Number(v);
    }
    // If Redis empty for many keys (cold start), fall back to HourlyAggregate recent hour for more context
    const entries = Object.entries(pageTotals);
    if (entries.length < 5) {
      const hr = await HourlyAggregate.findOne({})
        .sort({ hour: -1 })
        .lean()
        .exec();
      if (hr && hr.pageViews) {
        for (const [k, v] of Object.entries(hr.pageViews || {})) {
          pageTotals[k] = (pageTotals[k] || 0) + Number(v);
        }
      }
    }
    const topPages = Object.entries(pageTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // actions totals across last 5 minutes
    const actionTotals: Record<string, number> = {};
    for (const mk of minuteKeys) {
      const h = await redis.hgetall(`${mk}:ac`);
      for (const [k, v] of Object.entries(h || {}))
        actionTotals[k] = (actionTotals[k] || 0) + Number(v);
    }

    // active sessions: check set and TTL keys
    const sessions = await redis.smembers('active_sessions');
    let activeSessions = 0;
    if (sessions.length) {
      const pipe = redis.pipeline();
      for (const s of sessions) pipe.exists(`sess_ttl:${s}`);
      const res = await pipe.exec();
      const toPrune: string[] = [];
      res.forEach(([err, val], idx) => {
        if (val === 1) activeSessions++;
        else toPrune.push(sessions[idx]);
      });
      if (toPrune.length) {
        const p = redis.pipeline();
        toPrune.forEach(s => p.srem('active_sessions', s));
        await p.exec();
      }
    }

    // recent actions feed: get latest N (fast)
    const rawRecent = await redis.lrange('recent_actions', 0, 49);
    const recentActions = rawRecent
      .map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return { epm, topPages, actionTotals, activeSessions, recentActions };
  }

  function computeDiff(oldSnap: any, newSnap: any) {
    const diff: any = {};
    if (oldSnap.epm !== newSnap.epm) diff.epm = newSnap.epm;
    if (oldSnap.activeSessions !== newSnap.activeSessions)
      diff.activeSessions = newSnap.activeSessions;

    if (
      JSON.stringify(oldSnap.topPages || []) !==
      JSON.stringify(newSnap.topPages || [])
    )
      diff.topPages = newSnap.topPages;

    if (
      JSON.stringify(oldSnap.actions || {}) !==
      JSON.stringify(newSnap.actionTotals || {})
    )
      diff.actions = newSnap.actionTotals;

    // recent actions: send only new items
    const oldFirstTs = oldSnap.recentActionsFirstTs;
    const newFirst = newSnap.recentActions?.[0];
    const newFirstTs = newFirst ? newFirst.ts : null;
    if (oldFirstTs !== newFirstTs) {
      // determine new items by comparing set
      const oldSet = new Set(
        (oldSnap.recentActions || []).map((r: any) => JSON.stringify(r)),
      );
      const newItems = (newSnap.recentActions || []).filter(
        (r: any) => !oldSet.has(JSON.stringify(r)),
      );
      if (newItems.length) diff.actionsFeed = newItems;
      diff.recentActionsFirstTs = newFirstTs;
    }

    return diff;
  }

  // emit loop
  setInterval(async () => {
    try {
      const snap = await computeSnapshot();
      const diff = computeDiff(lastSnapshot, snap);
      if (Object.keys(diff).length) {
        io.emit('metrics:diff', diff);
        lastSnapshot = {
          epm: snap.epm,
          topPages: snap.topPages,
          actions: snap.actionTotals,
          activeSessions: snap.activeSessions,
          recentActionsFirstTs: snap.recentActions?.[0]?.ts || null,
          recentActions: snap.recentActions,
        };
      }
    } catch (err) {
      console.error('realtime emitter error', err);
    }
  }, 5000);
}
