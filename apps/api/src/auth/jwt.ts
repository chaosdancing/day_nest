import { SignJWT, jwtVerify } from 'jose';

const enc = new TextEncoder();

export type JwtClaims = {
  sub: string;
  typ?: string;
  [k: string]: unknown;
};

async function sign(
  claims: JwtClaims,
  secret: string,
  ttlSeconds: number,
  typ: 'access' | 'refresh'
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return new SignJWT({ ...claims, typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(enc.encode(secret));
}

async function verify(
  token: string,
  secret: string,
  typ: 'access' | 'refresh'
): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret));
  if (payload.typ !== typ) throw new Error('wrong-token-type');
  return payload as JwtClaims;
}

export function signAccess(claims: JwtClaims, secret: string, ttlSeconds: number) {
  return sign(claims, secret, ttlSeconds, 'access');
}

export function verifyAccess(token: string, secret: string) {
  return verify(token, secret, 'access');
}

export function signRefresh(claims: JwtClaims, secret: string, ttlSeconds: number) {
  return sign(claims, secret, ttlSeconds, 'refresh');
}

export function verifyRefresh(token: string, secret: string) {
  return verify(token, secret, 'refresh');
}
