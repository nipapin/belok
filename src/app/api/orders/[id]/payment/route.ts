import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { syncSbpPayment } from '@/lib/tbankPayments';
import type { OrderRow } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { id } = await params;
    const order = await queryOne<OrderRow>(`SELECT * FROM "orders" WHERE id = $1`, [id]);
    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    }

    const payment = await syncSbpPayment(order);
    return NextResponse.json(payment);
  } catch (error) {
    console.error('Get order payment error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
