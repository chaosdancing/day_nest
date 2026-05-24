import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const enc = new TextEncoder();

const DEFAULT_BIND_TTL_SECONDS = 300;

export type BindTokenClaims = JWTPayload & {
  openid: string;
  typ: 'bind';
};

export type BindTokenInput = {
  openid: string;
};

/**
 * Sign a short-lived bind token used to bridge WeChat quick-login with
 * daynest account creation/linking. Carries the wechat `openid` so the
 * server can finalize binding without re-running `jscode2session`.
 *
 * Default TTL is 5 minutes; pass `ttlSeconds` to override.
 */
export async function signBindToken(
  input: BindTokenInput,
  secret: string,
  ttlSeconds = DEFAULT_BIND_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return new SignJWT({ openid: input.openid, typ: 'bind' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.openid)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(enc.encode(secret));
}

export async function verifyBindToken(
  token: string,
  secret: string,
): Promise<BindTokenClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret));
  if (payload.typ !== 'bind') throw new Error('wrong-token-type');
  if (typeof payload.openid !== 'string' || payload.openid.length === 0) {
    throw new Error('missing-openid');
  }
  return payload as BindTokenClaims;
}
