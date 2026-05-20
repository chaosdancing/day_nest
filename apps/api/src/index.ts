import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { getPrisma } from './db.js';
import { QiniuStorage } from './storage/qiniu.js';

const config = loadConfig();
const prisma = getPrisma();
const storage = new QiniuStorage({
  accessKey: config.qiniu.accessKey,
  secretKey: config.qiniu.secretKey,
  bucket: config.qiniu.bucket,
  domain: config.qiniu.domain,
  zone: config.qiniu.zone,
});

const app = await buildServer(
  {
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        config.env === 'production'
          ? undefined
          : { target: 'pino-pretty' },
    },
  },
  { config, prisma, storage }
);

await app.listen({ port: config.port, host: '0.0.0.0' });
