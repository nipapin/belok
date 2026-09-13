import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/db';
import { getUserWithLoyaltyById } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { tryNotifyUser } from '@/lib/push';
import { getNotificationSettings } from '@/lib/notificationSettings';

interface RedeemBody {
  userId?: string;
  amount?: number | string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as RedeemBody | null;
    const userId = body?.userId?.toString().trim();
    const amount = Math.round(Number(body?.amount));

    if (!userId) {
      return NextResponse.json({ error: 'Не указан пользователь' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Некорректная сумма списания' }, { status: 400 });
    }

    const targetUser = await getUserWithLoyaltyById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    if (amount > Math.floor(targetUser.bonusBalance)) {
      return NextResponse.json(
        { error: `Недостаточно бонусов: доступно ${Math.floor(targetUser.bonusBalance)}` },
        { status: 400 }
      );
    }

    try {
      await withTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE "users"
              SET "bonusBalance" = "bonusBalance" - $1
            WHERE id = $2 AND "bonusBalance" >= $1`,
          [amount, userId]
        );
        if (updated.rowCount === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        await client.query(
          `INSERT INTO "bonus_transactions"
             (id, "userId", amount, type, description)
           VALUES ($1, $2, $3, 'SPENT', $4)`,
          [uuidv4(), userId, -amount, 'Списание бонусов на кассе']
        );
      });
    } catch (txError) {
      if ((txError as Error).message === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json({ error: 'Недостаточно бонусов' }, { status: 400 });
      }
      throw txError;
    }

    const updated = await getUserWithLoyaltyById(userId);

    if ((await getNotificationSettings()).autoPushLoyalty) {
      void tryNotifyUser(userId, {
        title: `−${amount} бонусов`,
        body: `Бонусы списаны при оплате на кассе. Текущий баланс: ${Math.floor(updated?.bonusBalance ?? 0)}.`,
        url: '/profile/bonuses',
        tag: 'bonus',
      });
    }

    return NextResponse.json({
      bonusSpent: amount,
      user: updated && {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
        bonusBalance: updated.bonusBalance,
        totalSpent: updated.totalSpent,
        loyaltyLevel: updated.loyaltyLevel,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    }
    console.error('Redeem loyalty error:', e);
    return NextResponse.json({ error: 'Ошибка списания' }, { status: 500 });
  }
}
