import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'belok_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10; // ~10 лет

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET (or legacy JWT_SECRET) must be set in .env');
}

export function signSessionId(sessionId: string): string {
  return createHmac('sha256', SESSION_SECRET!).update(sessionId).digest('hex');
}

export function packSessionCookie(sessionId: string): string {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

export function readSessionIdFromCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signSessionId(id);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sig, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch {
    return null;
  }
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return id;
}
