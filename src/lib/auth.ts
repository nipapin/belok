import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from './db';
import type { LoyaltyLevelRow, SessionRow, UserRow, UserWithLoyaltyRow } from './types';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  packSessionCookie,
  readSessionIdFromCookie,
} from './sessionCookie';

export { SESSION_COOKIE, readSessionIdFromCookie };
export type UserWithLoyalty = UserWithLoyaltyRow;

const USER_COLUMNS_U = `
  u."id", u."email", u."emailVerifiedAt", u."passwordHash", u."phone", u."name",
  u."avatarUrl", u."role", u."bonusBalance", u."totalSpent", u."loyaltyLevelId",
  u."createdAt", u."updatedAt"
`;

function isHttps(forwarded: string | null, requestProtocol?: string | null): boolean {
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  if (requestProtocol) return requestProtocol === 'https:';
  return false;
}

export function shouldUseSecureAuthCookie(request: NextRequest): boolean {
  return isHttps(request.headers.get('x-forwarded-proto'), request.nextUrl.protocol);
}

export function authCookieBaseOptions(request: NextRequest) {
  return {
    httpOnly: true,
    secure: shouldUseSecureAuthCookie(request),
    sameSite: 'lax' as const,
    path: '/',
  };
}

async function secureFlagFromIncomingHeaders(): Promise<boolean> {
  const h = await headers();
  return isHttps(h.get('x-forwarded-proto'));
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
): Promise<SessionRow> {
  const id = uuidv4();
  const row = await queryOne<SessionRow>(
    `INSERT INTO "sessions"("id", "userId", "userAgent", "ipAddress")
     VALUES ($1, $2, $3, $4)
     RETURNING "id", "userId", "userAgent", "ipAddress", "revokedAt",
               "lastSeenAt", "createdAt", "updatedAt"`,
    [id, userId, meta?.userAgent ?? null, meta?.ipAddress ?? null]
  );
  if (!row) throw new Error('Failed to create session');
  return row;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE "sessions" SET "revokedAt" = NOW() WHERE "id" = $1`,
    [sessionId]
  ).catch(() => {
    /* already gone — ignore */
  });
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const secure = await secureFlagFromIncomingHeaders();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, packSessionCookie(sessionId), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function setSessionCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } },
  request: NextRequest,
  sessionId: string
): void {
  response.cookies.set(SESSION_COOKIE, packSessionCookie(sessionId), {
    ...authCookieBaseOptions(request),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } },
  request: NextRequest
): void {
  response.cookies.set(SESSION_COOKIE, '', {
    ...authCookieBaseOptions(request),
    maxAge: 0,
  });
}

interface SessionUserJoined extends UserRow {
  session_revoked_at: Date | null;
  session_last_seen_at: Date;
  session_id_str: string;
  ll_id: string | null;
  ll_name: string | null;
  ll_minSpent: number | null;
  ll_cashbackPercent: number | null;
  ll_discountPercent: number | null;
  ll_sortOrder: number | null;
}

export async function getCurrentUser(): Promise<UserWithLoyalty | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionId = readSessionIdFromCookie(raw);
  if (!sessionId) return null;

  const row = await queryOne<SessionUserJoined>(
    `SELECT
       u."id", u."email", u."emailVerifiedAt", u."passwordHash", u."phone", u."name",
       u."avatarUrl", u."role", u."bonusBalance", u."totalSpent", u."loyaltyLevelId",
       u."createdAt", u."updatedAt",
       s."revokedAt"   AS "session_revoked_at",
       s."lastSeenAt"  AS "session_last_seen_at",
       s."id"          AS "session_id_str",
       l."id"          AS "ll_id",
       l."name"        AS "ll_name",
       l."minSpent"    AS "ll_minSpent",
       l."cashbackPercent" AS "ll_cashbackPercent",
       l."discountPercent" AS "ll_discountPercent",
       l."sortOrder"   AS "ll_sortOrder"
     FROM "sessions" s
     JOIN "users" u ON u."id" = s."userId"
     LEFT JOIN "loyalty_levels" l ON l."id" = u."loyaltyLevelId"
     WHERE s."id" = $1`,
    [sessionId]
  );

  if (!row || row.session_revoked_at) return null;

  const now = Date.now();
  const minutesSinceTouch = (now - new Date(row.session_last_seen_at).getTime()) / 60_000;
  if (minutesSinceTouch > 5) {
    void query(
      `UPDATE "sessions" SET "lastSeenAt" = NOW() WHERE "id" = $1`,
      [row.session_id_str]
    ).catch(() => {
      /* swallow — not critical */
    });
  }

  const loyaltyLevel: LoyaltyLevelRow | null = row.ll_id
    ? {
        id: row.ll_id,
        name: row.ll_name as string,
        minSpent: row.ll_minSpent as number,
        cashbackPercent: row.ll_cashbackPercent as number,
        discountPercent: row.ll_discountPercent as number,
        sortOrder: row.ll_sortOrder as number,
      }
    : null;

  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    passwordHash: row.passwordHash,
    phone: row.phone,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    bonusBalance: row.bonusBalance,
    totalSpent: row.totalSpent,
    loyaltyLevelId: row.loyaltyLevelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    loyaltyLevel,
  };
}

export async function getUserWithLoyaltyById(id: string): Promise<UserWithLoyalty | null> {
  const row = await queryOne<UserRow & {
    ll_id: string | null;
    ll_name: string | null;
    ll_minSpent: number | null;
    ll_cashbackPercent: number | null;
    ll_discountPercent: number | null;
    ll_sortOrder: number | null;
  }>(
    `SELECT ${USER_COLUMNS_U},
       l."id"          AS "ll_id",
       l."name"        AS "ll_name",
       l."minSpent"    AS "ll_minSpent",
       l."cashbackPercent" AS "ll_cashbackPercent",
       l."discountPercent" AS "ll_discountPercent",
       l."sortOrder"   AS "ll_sortOrder"
     FROM "users" u
     LEFT JOIN "loyalty_levels" l ON l."id" = u."loyaltyLevelId"
     WHERE u."id" = $1`,
    [id]
  );
  if (!row) return null;
  const loyaltyLevel: LoyaltyLevelRow | null = row.ll_id
    ? {
        id: row.ll_id,
        name: row.ll_name as string,
        minSpent: row.ll_minSpent as number,
        cashbackPercent: row.ll_cashbackPercent as number,
        discountPercent: row.ll_discountPercent as number,
        sortOrder: row.ll_sortOrder as number,
      }
    : null;
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    passwordHash: row.passwordHash,
    phone: row.phone,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    bonusBalance: row.bonusBalance,
    totalSpent: row.totalSpent,
    loyaltyLevelId: row.loyaltyLevelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    loyaltyLevel,
  };
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export { USER_COLUMNS_U };
