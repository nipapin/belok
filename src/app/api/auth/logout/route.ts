import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const refreshTokenValue = request.cookies.get('refreshToken')?.value;

    if (refreshTokenValue) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshTokenValue },
      });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
