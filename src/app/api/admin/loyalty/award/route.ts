import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, withTransaction } from '@/lib/db';
import { getUserWithLoyaltyById } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { tryNotifyUser } from '@/lib/push';
import type { LoyaltyLevelRow } from '@/lib/types';

interface AwardBody {
  userId?: string;
  amount?: number | string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json().catch(() => null)) as AwardBody | null;
    const userId = body?.userId?.toString().trim();
    const amount = Math.round(Number(body?.amount));

    if (!userId) {
      return NextResponse.json({ error: 'Не указан пользователь' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Некорректная сумма' }, { status: 400 });
    }

    const targetUser = await getUserWithLoyaltyById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const cashbackPercent = targetUser.loyaltyLevel?.cashbackPercent ?? 3;
    const bonusEarned = Math.round(amount * (cashbackPercent / 100));

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE "users"
            SET "bonusBalance" = "bonusBalance" + $1,
                "totalSpent"   = "totalSpent" + $2
          WHERE id = $3`,
        [bonusEarned, amount, userId]
      );

      await client.query(
        `INSERT INTO "bonus_transactions"
           (id, "userId", amount, type, description)
         VALUES ($1, $2, $3, 'EARNED', $4)`,
        [
          uuidv4(),
          userId,
          bonusEarned,
          `Кэшбэк ${cashbackPercent}% за заказ ${amount} ₽ (касса)`,
        ]
      );

      const newTotalSpent = (targetUser.totalSpent || 0) + amount;
      const nextLevel = await client.query<LoyaltyLevelRow>(
        `SELECT id FROM "loyalty_levels"
          WHERE "minSpent" <= $1
          ORDER BY "minSpent" DESC
          LIMIT 1`,
        [newTotalSpent]
      );
      const next = nextLevel.rows[0];
      if (next && next.id !== targetUser.loyaltyLevelId) {
        await client.query(
          `UPDATE "users" SET "loyaltyLevelId" = $1 WHERE id = $2`,
          [next.id, userId]
        );
      }
    });

    const updated = await getUserWithLoyaltyById(userId);

    // Best-effort push: bonus credit + level-up (if it happened).
    if (bonusEarned > 0) {
      void tryNotifyUser(userId, {
        title: `+${bonusEarned} ₽ бонусов`,
        body: `Кэшбэк ${cashbackPercent}% за заказ ${amount} ₽. Можно тратить в следующем заказе.`,
        url: '/profile/bonuses',
        tag: 'bonus',
      });
    }
    if (updated && targetUser.loyaltyLevelId !== updated.loyaltyLevelId && updated.loyaltyLevel) {
      // Level changed during this award — congratulate.
      const nextLevelInfo = await queryOne<LoyaltyLevelRow>(
        `SELECT id, name, "minSpent", "cashbackPercent", "discountPercent", "sortOrder"
           FROM "loyalty_levels" WHERE id = $1`,
        [updated.loyaltyLevelId]
      );
      if (nextLevelInfo) {
        void tryNotifyUser(userId, {
          title: `Поздравляем — уровень «${nextLevelInfo.name}»!`,
          body: `Кэшбэк ${nextLevelInfo.cashbackPercent}% и скидка ${nextLevelInfo.discountPercent}% теперь ваши.`,
          url: '/profile',
          tag: 'level-up',
        });
      }
    }

    return NextResponse.json({
      bonusEarned,
      cashbackPercent,
      amount,
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
    console.error('Award loyalty error:', e);
    return NextResponse.json({ error: 'Ошибка начисления' }, { status: 500 });
  }
}
