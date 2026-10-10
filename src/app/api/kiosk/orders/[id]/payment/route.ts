import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { KioskUnauthorizedError, requireKioskUnlocked } from '@/lib/kioskAuth';
import { syncSbpPayment } from '@/lib/tbankPayments';
import { aqsiOrderState, cancelAqsiCard, processAqsiJobs } from '@/lib/aqsiJobs';
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

    await processAqsiJobs();
    const latest = await queryOne<OrderRow>(`SELECT * FROM orders WHERE id=$1`,[id]);
    const payment = latest?.paymentMethod === 'CARD'
      ? {paymentStatus:latest.paymentStatus,payload:null,image:null}
      : await syncSbpPayment(latest ?? order);
    return NextResponse.json({...payment,...await aqsiOrderState(id)},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    if (error instanceof KioskUnauthorizedError) {
      return NextResponse.json({ error: 'Терминал заблокирован' }, { status: 401 });
    }
    console.error('Get kiosk order payment error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    await requireKioskUnlocked();
    const {id}=await params;
    const order=await queryOne<OrderRow>(`SELECT * FROM orders WHERE id=$1 AND source='KIOSK'`,[id]);
    if (!order || order.paymentMethod !== 'CARD') return NextResponse.json({error:'Заказ не найден'},{status:404});
    await cancelAqsiCard(id);
    return NextResponse.json({requested:true});
  } catch(error) {
    if (error instanceof KioskUnauthorizedError) return NextResponse.json({error:'Нет доступа'},{status:401});
    return NextResponse.json({error:'Не удалось запросить отмену. Проверьте статус оплаты.'},{status:502});
  }
}
