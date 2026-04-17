/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { createPayment } from '@/lib/yookassa';
import { brandMark } from '@/lib/brand';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: true,
            customizations: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { items, bonusUsed = 0, comment } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 });
    }

    const productIds = items.map((i: { productId: string }) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    let subtotal = 0;
    const orderItems = items.map((item: {
      productId: string;
      quantity: number;
      customizations: { ingredientId: string; action: string; priceDelta: number }[];
    }) => {
      const product: any = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);

      const extras = (item.customizations || [])
        .filter((c: { action: string }) => c.action === 'ADD')
        .reduce((s: number, c: { priceDelta: number }) => s + (c.priceDelta || 0), 0);
      const unitPrice = product.price + extras;
      subtotal += unitPrice * item.quantity;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        customizations: {
          create: (item.customizations || []).map((c: { ingredientId: string; action: string; priceDelta: number }) => ({
            ingredientId: c.ingredientId,
            action: c.action,
            priceDelta: c.priceDelta || 0,
          })),
        },
      };
    });

    // Apply loyalty discount
    const loyaltyLevel = user.loyaltyLevel;
    const discountPercent = loyaltyLevel?.discountPercent || 0;
    const discountAmount = Math.round(subtotal * (discountPercent / 100));

    // Validate bonus usage (max 30% of total after discount)
    const afterDiscount = subtotal - discountAmount;
    const maxBonus = Math.floor(afterDiscount * 0.3);
    const actualBonusUsed = Math.min(bonusUsed, maxBonus, user.bonusBalance);

    const total = afterDiscount - actualBonusUsed;

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        total,
        discountAmount,
        bonusUsed: actualBonusUsed,
        comment,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: { include: { product: true, customizations: true } },
      },
    });

    // Deduct bonuses
    if (actualBonusUsed > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { bonusBalance: { decrement: actualBonusUsed } },
      });
      await prisma.bonusTransaction.create({
        data: {
          userId: user.id,
          amount: -actualBonusUsed,
          type: 'SPENT',
          orderId: order.id,
          description: `Списание бонусов за заказ`,
        },
      });
    }

    // Create payment
    let paymentUrl: string | null = null;
    try {
      const payment = await createPayment({
        amount: total,
        orderId: order.id,
        description: `Заказ №${order.id.slice(0, 8)} — ${brandMark}`,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${order.id}`,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.id },
      });

      paymentUrl = payment.confirmation?.confirmation_url;
    } catch (paymentError) {
      console.error('Payment creation failed:', paymentError);
    }

    return NextResponse.json({
      order,
      paymentUrl,
    });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Ошибка создания заказа' }, { status: 500 });
  }
}
