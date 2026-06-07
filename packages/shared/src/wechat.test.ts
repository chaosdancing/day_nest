import { describe, it, expect } from 'vitest';
import {
  WechatLoginInput,
  WechatLoginResponse,
  WechatBindInput,
  WechatBindResponse,
  WechatRegisterInput,
  RefreshTokenInput,
  RefreshTokenResponse,
  SubscribeAuthInput,
  WECHAT_TEMPLATES,
  WechatErrorCode,
} from './wechat.js';

describe('WechatLoginInput', () => {
  it('accepts a code-only payload', () => {
    expect(() => WechatLoginInput.parse({ code: 'abc123' })).not.toThrow();
  });
  it('rejects empty code', () => {
    expect(() => WechatLoginInput.parse({ code: '' })).toThrow();
  });
  it('rejects missing code', () => {
    expect(() => WechatLoginInput.parse({})).toThrow();
  });
});

describe('WechatLoginResponse', () => {
  it('accepts the BOUND variant', () => {
    expect(() =>
      WechatLoginResponse.parse({
        status: 'bound',
        user: {
          id: '00000000-0000-0000-0000-000000000000',
          username: 'alice',
          displayName: 'Alice',
          avatarKey: null,
          hasWechatBound: true,
          canUpload: true,
        },
        accessToken: 'at',
        refreshToken: 'rt',
      }),
    ).not.toThrow();
  });

  it('accepts the UNBOUND variant', () => {
    expect(() =>
      WechatLoginResponse.parse({
        status: 'unbound',
        bindToken: 'bt-xyz',
      }),
    ).not.toThrow();
  });

  it('strips fields belonging to the other variant', () => {
    const parsed = WechatLoginResponse.parse({
      status: 'unbound',
      bindToken: 'bt-xyz',
      accessToken: 'should-be-stripped',
      user: { id: '00000000-0000-0000-0000-000000000000', username: 'a', displayName: 'A', avatarKey: null, hasWechatBound: true, canUpload: true },
    });
    expect(parsed.status).toBe('unbound');
    if (parsed.status !== 'unbound') throw new Error('unreachable');
    expect(parsed.bindToken).toBe('bt-xyz');
    expect((parsed as Record<string, unknown>).accessToken).toBeUndefined();
    expect((parsed as Record<string, unknown>).user).toBeUndefined();
  });

  it('rejects payloads missing required fields for the discriminated variant', () => {
    expect(() =>
      WechatLoginResponse.parse({ status: 'bound', bindToken: 'bt-xyz' }),
    ).toThrow();
  });
});

describe('WechatBindInput', () => {
  it('accepts a valid payload', () => {
    expect(() =>
      WechatBindInput.parse({
        bindToken: 'bt',
        username: 'alice',
        password: 'password123',
      }),
    ).not.toThrow();
  });
  it('rejects short password', () => {
    expect(() =>
      WechatBindInput.parse({
        bindToken: 'bt',
        username: 'alice',
        password: 'short',
      }),
    ).toThrow();
  });
});

describe('WechatBindResponse error codes', () => {
  it('lists the 5 known error codes', () => {
    const codes: WechatErrorCode[] = [
      'BIND_TOKEN_INVALID',
      'CREDENTIALS_INVALID',
      'WECHAT_ALREADY_BOUND',
      'USER_ALREADY_BOUND',
      'WECHAT_DISABLED',
    ];
    expect(codes.length).toBe(5);
  });
});

describe('WechatRegisterInput', () => {
  it('accepts a valid payload with an invite', () => {
    expect(() =>
      WechatRegisterInput.parse({
        bindToken: 'bt',
        inviteToken: 'invite-token-xyz',
        username: 'newuser',
        displayName: 'New User',
      }),
    ).not.toThrow();
  });
  it('accepts a valid payload WITHOUT an invite (view-only account)', () => {
    expect(() =>
      WechatRegisterInput.parse({
        bindToken: 'bt',
        username: 'newuser',
        displayName: 'New User',
      }),
    ).not.toThrow();
  });
  it('rejects invalid username chars', () => {
    expect(() =>
      WechatRegisterInput.parse({
        bindToken: 'bt',
        username: 'has space',
        displayName: 'X',
      }),
    ).toThrow();
  });
});

describe('RefreshTokenInput', () => {
  it('accepts a refresh token', () => {
    expect(() => RefreshTokenInput.parse({ refreshToken: 'rt' })).not.toThrow();
  });
  it('rejects empty refresh token', () => {
    expect(() => RefreshTokenInput.parse({ refreshToken: '' })).toThrow();
  });
});

describe('RefreshTokenResponse', () => {
  it('accepts both tokens', () => {
    expect(() =>
      RefreshTokenResponse.parse({ accessToken: 'a', refreshToken: 'r' }),
    ).not.toThrow();
  });
});

describe('SubscribeAuthInput', () => {
  it('accepts an array of accepted template ids', () => {
    expect(() =>
      SubscribeAuthInput.parse({
        accepted: [WECHAT_TEMPLATES.NEW_PHOTO, WECHAT_TEMPLATES.WEEKLY_DIGEST],
      }),
    ).not.toThrow();
  });
  it('rejects unknown template ids', () => {
    expect(() =>
      SubscribeAuthInput.parse({ accepted: ['unknown-template-id'] }),
    ).toThrow();
  });
  it('accepts empty array (user declined all)', () => {
    expect(() => SubscribeAuthInput.parse({ accepted: [] })).not.toThrow();
  });
});

describe('WECHAT_TEMPLATES', () => {
  it('exposes well-known template ids', () => {
    expect(WECHAT_TEMPLATES.NEW_PHOTO).toBeDefined();
    expect(WECHAT_TEMPLATES.WEEKLY_DIGEST).toBeDefined();
    expect(typeof WECHAT_TEMPLATES.NEW_PHOTO).toBe('string');
  });
});
