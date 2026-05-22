import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { getPrisma } from './db.js';
import { QiniuStorage } from './storage/qiniu.js';
import { DisabledWechatClient } from './wechat/client.js';
import { RealWechatClient } from './wechat/realClient.js';
import { AccessTokenCache } from './wechat/accessTokenCache.js';
import type { WechatClient } from './wechat/client.js';

const config = loadConfig();
const prisma = getPrisma();
const storage = new QiniuStorage({
  accessKey: config.qiniu.accessKey,
  secretKey: config.qiniu.secretKey,
  bucket: config.qiniu.bucket,
  domain: config.qiniu.domain,
  zone: config.qiniu.zone,
});

const wechat: WechatClient = config.wechat.enabled
  ? new RealWechatClient({
      appId: config.wechat.appId!,
      appSecret: config.wechat.appSecret!,
      cache: new AccessTokenCache({ cachePath: config.wechat.accessTokenCachePath }),
    })
  : new DisabledWechatClient();

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
  { config, prisma, storage, wechat }
);

await app.listen({ port: config.port, host: '0.0.0.0' });
