import { buildServer } from './server.js';

const app = await buildServer({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty' },
  },
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
