import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, object } = body;

    if (event === 'payment.succeeded') {
      const orderId = object.metadata?.order_id;
      if (!orderId) return NextResponse.json({ ok: true });

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: { include: { loyaltyLevel: true } } },
      });

      if (!order) return NextResponse.json({ ok: true });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'SUCCEEDED',
          status: 'CONFIRMED',
        },
      });

      // Calculate and apply cashback
      const cashbackPercent = order.user.loyaltyLevel?.cashbackPercent || 3;
      const bonusEarned = Math.round(order.total * (cashbackPercent / 100));

      if (bonusEarned > 0) {
        await prisma.order.update({
          where: { id: orderId },
          data: { bonusEarned },
        });

        await prisma.user.update({
          where: { id: order.userId },
          data: {
            bonusBalance: { increment: bonusEarned },
            totalSpent: { increment: order.total },
          },
        });

        await prisma.bonusTransaction.create({
          data: {
            userId: order.userId,
            amount: bonusEarned,
            type: 'EARNED',
            orderId: order.id,
            description: `Кэшбэк ${cashbackPercent}% за заказ`,
          },
        });

        // Check loyalty level upgrade
        const newTotalSpent = order.user.totalSpent + order.total;
        const nextLevel = await prisma.loyaltyLevel.findFirst({
          where: { minSpent: { lte: newTotalSpent } },
          orderBy: { minSpent: 'desc' },
        });

        if (nextLevel && nextLevel.id !== order.user.loyaltyLevelId) {
          await prisma.user.update({
            where: { id: order.userId },
            data: { loyaltyLevelId: nextLevel.id },
          });
        }
      }
    }

    if (event === 'payment.canceled') {
      const orderId = object.metadata?.order_id;
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order) {
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'CANCELLED', status: 'CANCELLED' },
          });

          // Refund bonuses if used
          if (order.bonusUsed > 0) {
            await prisma.user.update({
              where: { id: order.userId },
              data: { bonusBalance: { increment: order.bonusUsed } },
            });
            await prisma.bonusTransaction.create({
              data: {
                userId: order.userId,
                amount: order.bonusUsed,
                type: 'EARNED',
                orderId: order.id,
                description: 'Возврат бонусов (отмена заказа)',
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
