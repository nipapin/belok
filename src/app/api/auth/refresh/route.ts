import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { SESSION_COOKIE, readSessionIdFromCookie } from '@/lib/auth';
import type { SessionRow } from '@/lib/types';

/**
 * Сессии теперь живут до явного выхода (см. `src/lib/auth.ts`), поэтому
 * этот endpoint больше не выдаёт новые токены. Он остаётся ради совместимости
 * со старым клиентом и просто подтверждает, что сессия валидна.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = request.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = readSessionIdFromCookie(raw);
    if (!sessionId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const session = await queryOne<SessionRow>(
      `SELECT id, "userId", "userAgent", "ipAddress", "revokedAt",
              "lastSeenAt", "createdAt", "updatedAt"
         FROM "sessions" WHERE id = $1`,
      [sessionId]
    );
    if (!session || session.revokedAt) {
      return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Refresh session error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
