import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { toClientUser } from '@/lib/userClient';

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { name, email } = await request.json();

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
      },
      include: { loyaltyLevel: true },
    });

    return NextResponse.json({
      user: toClientUser(updated),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
