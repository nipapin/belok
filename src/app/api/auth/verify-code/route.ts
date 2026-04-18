import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signAccessToken, signRefreshToken } from '@/lib/auth';
import { toClientUser } from '@/lib/userClient';
import { isAdminBypassPhone } from '@/lib/adminBypassPhones';

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json({ error: 'Телефон и код обязательны' }, { status: 400 });
    }

    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        phone,
        code,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationCode) {
      return NextResponse.json({ error: 'Неверный или просроченный код' }, { status: 400 });
    }

    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true },
    });

    const defaultLevel = await prisma.loyaltyLevel.findFirst({
      where: { minSpent: 0 },
      orderBy: { minSpent: 'asc' },
    });

    const adminBypass = isAdminBypassPhone(phone);

    let user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          role: adminBypass ? 'ADMIN' : 'USER',
          bonusBalance: 0,
          totalSpent: 0,
          loyaltyLevelId: defaultLevel?.id,
        },
      });
    } else if (adminBypass && user.role !== 'ADMIN') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    const payload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { loyaltyLevel: true },
    });

    if (!fullUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: toClientUser(fullUser),
      isNewUser: !user.name,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60,
    });
    response.cookies.set('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
