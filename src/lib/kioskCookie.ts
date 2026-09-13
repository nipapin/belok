import { createHmac, timingSafeEqual } from 'node:crypto';

export const KIOSK_COOKIE = 'belok_kiosk';
export const KIOSK_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET (or legacy JWT_SECRET) must be set in .env');
}

function signKioskUnlock(pinHash: string): string {
  return createHmac('sha256', SESSION_SECRET!).update(`kiosk:${pinHash}`).digest('hex');
}

export function packKioskCookie(pinHash: string): string {
  return signKioskUnlock(pinHash);
}

export function isValidKioskCookie(raw: string | undefined | null, pinHash: string): boolean {
  if (!raw) return false;
  const expected = packKioskCookie(pinHash);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(raw, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
