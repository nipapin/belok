import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/appSettings';
import { authCookieBaseOptions } from '@/lib/auth';
import {
  isValidKioskCookie,
  KIOSK_COOKIE,
  KIOSK_MAX_AGE_SECONDS,
  packKioskCookie,
} from '@/lib/kioskCookie';

const SETTINGS_KEY = 'kiosk';

export type KioskSettings = {
  pinHash: string;
};

export class KioskUnauthorizedError extends Error {
  constructor() {
    super('KIOSK_UNAUTHORIZED');
    this.name = 'KioskUnauthorizedError';
  }
}

export function isValidKioskPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function getKioskSettings(): Promise<KioskSettings | null> {
  const value = await getAppSetting<KioskSettings>(SETTINGS_KEY);
  if (!value?.pinHash || typeof value.pinHash !== 'string') return null;
  return { pinHash: value.pinHash };
}

export async function setKioskPin(pin: string): Promise<void> {
  const pinHash = await bcrypt.hash(pin, 10);
  await setAppSetting(SETTINGS_KEY, { pinHash });
}

export async function verifyKioskPin(pin: string): Promise<boolean> {
  const settings = await getKioskSettings();
  if (!settings) return false;
  return bcrypt.compare(pin, settings.pinHash);
}

export async function isKioskUnlocked(): Promise<boolean> {
  const settings = await getKioskSettings();
  if (!settings) return false;
  const cookieStore = await cookies();
  const raw = cookieStore.get(KIOSK_COOKIE)?.value;
  return isValidKioskCookie(raw, settings.pinHash);
}

export async function requireKioskUnlocked(): Promise<void> {
  if (!(await isKioskUnlocked())) {
    throw new KioskUnauthorizedError();
  }
}

export function setKioskCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } },
  request: NextRequest,
  pinHash: string
): void {
  response.cookies.set(KIOSK_COOKIE, packKioskCookie(pinHash), {
    ...authCookieBaseOptions(request),
    maxAge: KIOSK_MAX_AGE_SECONDS,
  });
}
