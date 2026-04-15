import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.role !== undefined && { role: body.role }),
        ...(body.bonusBalance !== undefined && { bonusBalance: parseFloat(body.bonusBalance) }),
        ...(body.loyaltyLevelId !== undefined && { loyaltyLevelId: body.loyaltyLevelId }),
      },
      include: { loyaltyLevel: true },
    });

    if (body.bonusAdjustment) {
      await prisma.bonusTransaction.create({
        data: {
          userId: id,
          amount: parseFloat(body.bonusAdjustment),
          type: 'MANUAL',
          description: body.bonusReason || 'Ручная корректировка администратором',
        },
      });
    }

    return NextResponse.json({ user });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
