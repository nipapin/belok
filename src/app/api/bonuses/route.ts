import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const transactions = await prisma.bonusTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const levels = await prisma.loyaltyLevel.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      balance: user.bonusBalance,
      totalSpent: user.totalSpent,
      currentLevel: user.loyaltyLevel,
      levels,
      transactions,
    });
  } catch (error) {
    console.error('Get bonuses error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
