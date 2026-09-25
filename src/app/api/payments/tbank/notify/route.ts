import { NextRequest, NextResponse } from 'next/server';
import { verifyTbankNotification } from '@/lib/tbank';
import { applyTbankPaymentStatus } from '@/lib/tbankPayments';

function ok(): NextResponse {
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function readNotifyBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const obj: Record<string, unknown> = {};
    params.forEach((value, key) => {
      if (value === 'true') obj[key] = true;
      else if (value === 'false') obj[key] = false;
      else obj[key] = value;
    });
    return obj;
  }

  const json = await request.json().catch(() => null);
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readNotifyBody(request);
    if (!body) {
      return NextResponse.json({ error: 'Некорректное уведомление' }, { status: 400 });
    }

    if (!verifyTbankNotification(body)) {
      return NextResponse.json({ error: 'Неверная подпись' }, { status: 403 });
    }

    const orderId = typeof body.OrderId === 'string' ? body.OrderId : String(body.OrderId ?? '');
    const status = typeof body.Status === 'string' ? body.Status : String(body.Status ?? '');
    if (orderId && status) {
      await applyTbankPaymentStatus(orderId, status);
    }

    return ok();
  } catch (error) {
    console.error('T-Bank notify error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
