import { z } from 'zod';

const ts = z.union([z.string(), z.number()]).transform(v => new Date(v));

export const PageViewSchema = z.object({
  eventId: z.string().optional(),
  url: z.string(),
  timestamp: ts,
  sessionId: z.string(),
  referrer: z.string().optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
});

export const UserActionSchema = z.object({
  eventId: z.string().optional(),
  action: z.string(),
  category: z.string().optional(),
  label: z.string().optional(),
  value: z.number().optional(),
  timestamp: ts,
  sessionId: z.string(),
});

export const PerformanceSchema = z.object({
  eventId: z.string().optional(),
  metric: z.string(),
  value: z.number(),
  timestamp: ts,
  page: z.string().optional(),
  loadTime: z.number().optional(),
});
