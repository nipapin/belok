import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authCookieBaseOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const refreshTokenValue = request.cookies.get('refreshToken')?.value;

    if (refreshTokenValue) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshTokenValue },
      });
    }

    const response = NextResponse.json({ success: true });
    const opts = authCookieBaseOptions(request);
    response.cookies.set('accessToken', '', { ...opts, maxAge: 0 });
    response.cookies.set('refreshToken', '', { ...opts, maxAge: 0 });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
