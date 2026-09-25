import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { syncSbpPayment } from '@/lib/tbankPayments';
import type { OrderRow } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireKioskUnlocked();
    const { id } = await params;
    const order = await queryOne<OrderRow>(
      `SELECT * FROM "orders" WHERE id = $1 AND source = 'KIOSK'`,
      [id]
    );
    if (!order) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }

    const payment = await syncSbpPayment(order);
    return NextResponse.json(payment);
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Get kiosk order payment error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
