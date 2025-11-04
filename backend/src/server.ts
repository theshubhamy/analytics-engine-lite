import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from 'fastify-helmet';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { registerEventRoutes } from './routes/events';
import { registerAnalyticsRoutes } from './routes/analytics';
import { Queue } from './queue';
import { startRealtimeEmitter } from './utils/realtimeEmitter';

(async () => {
  await mongoose.connect(
    process.env.MONGO_URL || 'mongodb://localhost:27017/analytics',
  );

  const app = Fastify({ logger: true });
  await app.register(cors);
  await app.register(helmet as any);
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  const server = createServer(app.server);
  const io = new IOServer(server, { cors: { origin: '*' } });
  app.decorate('io', io);

  await Queue.init();
  await registerEventRoutes(app);
  await registerAnalyticsRoutes(app);

  startRealtimeEmitter(io);

  io.on('connection', s => app.log.info(`Socket connected ${s.id}`));

  const PORT = Number(process.env.PORT || 4000);
  server.listen({ port: PORT }, () =>
    app.log.info(`🚀 Server ready on ${PORT}`),
  );
})();
