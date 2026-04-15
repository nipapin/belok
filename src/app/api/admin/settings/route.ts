import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  try {
    await requireAdmin();
    const levels = await prisma.loyaltyLevel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return NextResponse.json({ levels });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const { levels } = await request.json();

    for (const level of levels) {
      await prisma.loyaltyLevel.update({
        where: { id: level.id },
        data: {
          name: level.name,
          minSpent: parseFloat(level.minSpent),
          cashbackPercent: parseFloat(level.cashbackPercent),
          discountPercent: parseFloat(level.discountPercent),
        },
      });
    }

    const updated = await prisma.loyaltyLevel.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ levels: updated });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
