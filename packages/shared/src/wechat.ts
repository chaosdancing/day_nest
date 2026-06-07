import { z } from 'zod';
import { UserDTO } from './auth.js';

/**
 * Well-known WeChat subscribe-message template IDs.
 *
 * Plan 01 v1 ships with two templates:
 *   - NEW_PHOTO     : sent when a new photo is uploaded
 *   - WEEKLY_DIGEST : sent weekly with that week's highlights
 *
 * These are placeholder template ids and MUST be replaced with the real
 * ids issued by the WeChat mini-program admin console before production
 * release (search WX_TEMPLATE_REPLACE in this repo).
 */
export const WECHAT_TEMPLATES = {
  NEW_PHOTO: 'WX_TEMPLATE_REPLACE_new_photo',
  WEEKLY_DIGEST: 'WX_TEMPLATE_REPLACE_weekly_digest',
} as const satisfies Record<string, string>;

export type WechatTemplateKey = keyof typeof WECHAT_TEMPLATES;
export type WechatTemplateId = (typeof WECHAT_TEMPLATES)[WechatTemplateKey];

const WECHAT_TEMPLATE_IDS = Object.values(WECHAT_TEMPLATES) as [
  WechatTemplateId,
  ...WechatTemplateId[],
];

// ---- POST /api/auth/wechat-login ----

export const WechatLoginInput = z.object({
  code: z.string().min(1),
});
export type WechatLoginInput = z.infer<typeof WechatLoginInput>;

const WechatLoginBoundResponse = z.object({
  status: z.literal('bound'),
  user: UserDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
});

const WechatLoginUnboundResponse = z.object({
  status: z.literal('unbound'),
  bindToken: z.string(),
});

export const WechatLoginResponse = z.discriminatedUnion('status', [
  WechatLoginBoundResponse,
  WechatLoginUnboundResponse,
]);
export type WechatLoginResponse = z.infer<typeof WechatLoginResponse>;

// ---- POST /api/auth/wechat-bind ----

export const WechatBindInput = z.object({
  bindToken: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(8).max(128),
});
export type WechatBindInput = z.infer<typeof WechatBindInput>;

export const WechatBindResponse = z.object({
  user: UserDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type WechatBindResponse = z.infer<typeof WechatBindResponse>;

/**
 * 4xx error codes returned by wechat-bind / wechat-register / wechat-login.
 * Surfaced in the response body's `error.code` field so the mini-program
 * can branch UX without parsing English messages.
 */
export type WechatErrorCode =
  | 'BIND_TOKEN_INVALID'
  | 'CREDENTIALS_INVALID'
  | 'WECHAT_ALREADY_BOUND'
  | 'USER_ALREADY_BOUND'
  | 'WECHAT_DISABLED';

// ---- POST /api/auth/wechat-register ----
//
// WeChat one-tap onboarding creates a brand-new account directly (no binding to
// an existing username, no password — the account authenticates via WeChat).
// The invite token is OPTIONAL: omit it to register a view-only account; supply
// a valid one to register with upload rights.

export const WechatRegisterInput = z.object({
  bindToken: z.string().min(1),
  inviteToken: z.string().min(8).optional(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
});
export type WechatRegisterInput = z.infer<typeof WechatRegisterInput>;

export const WechatRegisterResponse = WechatBindResponse;
export type WechatRegisterResponse = z.infer<typeof WechatRegisterResponse>;

// ---- POST /api/auth/redeem-invite ----
// Upgrade an existing (view-only) account to an uploader by redeeming an invite.

export const RedeemInviteInput = z.object({
  inviteToken: z.string().min(8),
});
export type RedeemInviteInput = z.infer<typeof RedeemInviteInput>;

export const RedeemInviteResponse = z.object({
  user: UserDTO,
});
export type RedeemInviteResponse = z.infer<typeof RedeemInviteResponse>;

// ---- POST /api/auth/refresh-token ----

export const RefreshTokenInput = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenInput>;

export const RefreshTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponse>;

// ---- POST /api/wechat/subscribe ----

export const SubscribeAuthInput = z.object({
  accepted: z.array(z.enum(WECHAT_TEMPLATE_IDS)),
});
export type SubscribeAuthInput = z.infer<typeof SubscribeAuthInput>;
