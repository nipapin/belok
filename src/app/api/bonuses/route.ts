import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { BonusTransactionRow, LoyaltyLevelRow } from '@/lib/types';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const transactions = await query<BonusTransactionRow>(
      `SELECT id, "userId", amount, type, "orderId", description, "createdAt"
         FROM "bonus_transactions"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 50`,
      [user.id]
    );

    const levels = await query<LoyaltyLevelRow>(
      `SELECT id, name, "minSpent", "cashbackPercent", "discountPercent", "sortOrder"
         FROM "loyalty_levels"
        ORDER BY "sortOrder" ASC`
    );

    return NextResponse.json({
      balance: user.bonusBalance,
      totalSpent: user.totalSpent,
      currentLevel: user.loyaltyLevel,
      levels,
      transactions,
    });
  } catch (error) {
    console.error('Get bonuses error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
