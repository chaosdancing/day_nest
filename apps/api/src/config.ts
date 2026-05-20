import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(72),
  QINIU_ACCESS_KEY: z.string().min(1),
  QINIU_SECRET_KEY: z.string().min(1),
  QINIU_BUCKET: z.string().min(1),
  QINIU_DOMAIN: z.string().url(),
  QINIU_ZONE: z
    .enum(['z0', 'z1', 'z2', 'na0', 'as0', 'cn-east-2'])
    .default('z0'),
  PORT: z.coerce.number().int().nonnegative().default(3000),
  CORS_ORIGIN: z.string().default('*'),
  COOKIE_DOMAIN: z.string().optional(),
});

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  jwt: {
    secret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  invite: { ttlHours: number };
  qiniu: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    domain: string;
    zone: string;
  };
  port: number;
  corsOrigin: string;
  cookieDomain?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Schema.parse(env);
  return {
    env: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    jwt: {
      secret: parsed.JWT_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessTtl: parsed.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtl: parsed.REFRESH_TOKEN_TTL_SECONDS,
    },
    invite: { ttlHours: parsed.INVITE_TOKEN_TTL_HOURS },
    qiniu: {
      accessKey: parsed.QINIU_ACCESS_KEY,
      secretKey: parsed.QINIU_SECRET_KEY,
      bucket: parsed.QINIU_BUCKET,
      domain: parsed.QINIU_DOMAIN,
      zone: parsed.QINIU_ZONE,
    },
    port: parsed.PORT,
    corsOrigin: parsed.CORS_ORIGIN,
    cookieDomain: parsed.COOKIE_DOMAIN,
  };
}
