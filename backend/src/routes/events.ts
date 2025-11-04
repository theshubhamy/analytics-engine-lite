import { FastifyInstance } from 'fastify';
import { Queue } from '../queue';
import {
  PageViewSchema,
  UserActionSchema,
  PerformanceSchema,
} from '../libs/validators';

export async function registerEventRoutes(app: FastifyInstance) {
  const parse = (schema: any, body: any) => schema.safeParse(body);

  app.post('/api/events/pageview', async (req, reply) => {
    const r = parse(PageViewSchema, req.body);
    if (!r.success) return reply.status(400).send(r.error.flatten());
    await Queue.queue.add('ingest', { type: 'pageview', event: r.data });
    return { ok: true };
  });

  app.post('/api/events/action', async (req, reply) => {
    const r = parse(UserActionSchema, req.body);
    if (!r.success) return reply.status(400).send(r.error.flatten());
    await Queue.queue.add('ingest', { type: 'action', event: r.data });
    return { ok: true };
  });

  app.post('/api/events/performance', async (req, reply) => {
    const r = parse(PerformanceSchema, req.body);
    if (!r.success) return reply.status(400).send(r.error.flatten());
    await Queue.queue.add('ingest', { type: 'performance', event: r.data });
    return { ok: true };
  });

  app.post('/api/events/batch', async (req, reply) => {
    const batch = Array.isArray(req.body) ? req.body : [];
    const jobs = [];
    for (const e of batch) {
      if (!e.type || !e.payload) continue;
      let schema;
      if (e.type === 'pageview') schema = PageViewSchema;
      else if (e.type === 'action') schema = UserActionSchema;
      else if (e.type === 'performance') schema = PerformanceSchema;
      else continue;
      const r = schema.safeParse(e.payload);
      if (r.success)
        jobs.push({ name: 'ingest', data: { type: e.type, event: r.data } });
    }
    if (!jobs.length)
      return reply.status(400).send({ error: 'no valid events' });
    await Queue.queue.addBulk(jobs);
    return { accepted: jobs.length };
  });
}
