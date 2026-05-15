import { createHash, randomInt } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from './db';
import type { VerificationCodeRow, VerificationPurpose } from './types';

const CODE_TTL_MS = 10 * 60 * 1000;
const MIN_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface IssueCodeResult {
  code: string;
  expiresAt: Date;
}

export async function issueCode(
  email: string,
  purpose: VerificationPurpose
): Promise<IssueCodeResult> {
  const normalized = normalizeEmail(email);

  const recent = await queryOne<VerificationCodeRow>(
    `SELECT id, email, "codeHash", purpose, attempts, "expiresAt", "consumedAt", "createdAt"
       FROM "verification_codes"
      WHERE email = $1 AND purpose = $2 AND "consumedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    [normalized, purpose]
  );

  if (recent) {
    const sinceLastMs = Date.now() - new Date(recent.createdAt).getTime();
    if (sinceLastMs < MIN_RESEND_INTERVAL_MS) {
      const retryInSec = Math.ceil((MIN_RESEND_INTERVAL_MS - sinceLastMs) / 1000);
      const err = new Error(`Подождите ${retryInSec} с перед повторной отправкой кода`);
      (err as Error & { retryInSec?: number }).retryInSec = retryInSec;
      (err as Error & { code?: string }).code = 'RATE_LIMITED';
      throw err;
    }
  }

  await query(
    `DELETE FROM "verification_codes"
      WHERE email = $1 AND purpose = $2 AND "consumedAt" IS NULL`,
    [normalized, purpose]
  );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await query(
    `INSERT INTO "verification_codes"(id, email, "codeHash", purpose, "expiresAt")
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), normalized, hashCode(code), purpose, expiresAt]
  );

  return { code, expiresAt };
}

export interface VerifyResult {
  ok: boolean;
  reason?: 'INVALID' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'NOT_FOUND';
}

export async function verifyAndConsumeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string
): Promise<VerifyResult> {
  const normalized = normalizeEmail(email);
  const record = await queryOne<VerificationCodeRow>(
    `SELECT id, email, "codeHash", purpose, attempts, "expiresAt", "consumedAt", "createdAt"
       FROM "verification_codes"
      WHERE email = $1 AND purpose = $2 AND "consumedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    [normalized, purpose]
  );

  if (!record) return { ok: false, reason: 'NOT_FOUND' };
  if (new Date(record.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };

  if (record.codeHash !== hashCode(code)) {
    await query(
      `UPDATE "verification_codes" SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );
    return { ok: false, reason: 'INVALID' };
  }

  await query(
    `UPDATE "verification_codes" SET "consumedAt" = NOW() WHERE id = $1`,
    [record.id]
  );
  return { ok: true };
}
