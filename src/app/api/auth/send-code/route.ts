import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendSms, generateCode } from '@/lib/sms';
import { brandMark } from '@/lib/brand';

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^\+7\d{10}$/.test(phone)) {
      return NextResponse.json(
        { error: 'Введите корректный номер телефона (+7XXXXXXXXXX)' },
        { status: 400 }
      );
    }

    const recentCode = await prisma.verificationCode.findFirst({
      where: {
        phone,
        isUsed: false,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });

    if (recentCode) {
      return NextResponse.json(
        { error: 'Код уже отправлен. Подождите минуту перед повторной отправкой.' },
        { status: 429 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.verificationCode.create({
      data: { phone, code, expiresAt, isUsed: false },
    });

    const sent = await sendSms(phone, `${brandMark}: ваш код подтверждения ${code}`);

    if (!sent && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Не удалось отправить SMS' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    });
  } catch (error) {
    console.error('Send code error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
