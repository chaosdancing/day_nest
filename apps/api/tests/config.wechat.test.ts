import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  QINIU_ACCESS_KEY: 'ak',
  QINIU_SECRET_KEY: 'sk',
  QINIU_BUCKET: 'bucket',
  QINIU_DOMAIN: 'https://cdn.example.com',
};

describe('config.wechat', () => {
  it('exposes enabled=false when credentials missing', () => {
    const cfg = loadConfig({ ...baseEnv } as NodeJS.ProcessEnv);
    expect(cfg.wechat.enabled).toBe(false);
    expect(cfg.wechat.appId).toBeUndefined();
    expect(cfg.wechat.appSecret).toBeUndefined();
  });

  it('exposes enabled=true when both credentials present', () => {
    const cfg = loadConfig({
      ...baseEnv,
      WECHAT_APPID: 'wxabc123',
      WECHAT_APP_SECRET: 'secret-xyz-789',
    } as NodeJS.ProcessEnv);
    expect(cfg.wechat.enabled).toBe(true);
    expect(cfg.wechat.appId).toBe('wxabc123');
    expect(cfg.wechat.appSecret).toBe('secret-xyz-789');
  });

  it('exposes accessTokenCachePath when set', () => {
    const cfg = loadConfig({
      ...baseEnv,
      WECHAT_APPID: 'wxabc123',
      WECHAT_APP_SECRET: 'secret-xyz-789',
      WECHAT_ACCESS_TOKEN_CACHE_PATH: '/tmp/wx-token.json',
    } as NodeJS.ProcessEnv);
    expect(cfg.wechat.accessTokenCachePath).toBe('/tmp/wx-token.json');
  });

  it('treats empty-string credentials as disabled (dotenv path)', () => {
    const cfg = loadConfig({
      ...baseEnv,
      WECHAT_APPID: '',
      WECHAT_APP_SECRET: '',
      WECHAT_ACCESS_TOKEN_CACHE_PATH: '   ',
    } as NodeJS.ProcessEnv);
    expect(cfg.wechat.enabled).toBe(false);
    expect(cfg.wechat.appId).toBeUndefined();
    expect(cfg.wechat.appSecret).toBeUndefined();
    expect(cfg.wechat.accessTokenCachePath).toBeUndefined();
  });
});
