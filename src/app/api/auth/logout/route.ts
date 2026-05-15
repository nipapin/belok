import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  clearSessionCookieOnResponse,
  readSessionIdFromCookie,
  revokeSession,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const raw = request.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = readSessionIdFromCookie(raw);
    if (sessionId) {
      await revokeSession(sessionId);
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookieOnResponse(response, request);
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
