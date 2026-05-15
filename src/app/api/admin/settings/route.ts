import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { LoyaltyLevelRow } from '@/lib/types';

interface LevelWithCountRow extends LoyaltyLevelRow {
  user_count: string;
}

interface IncomingLevel {
  id: string;
  name: string;
  minSpent: string | number;
  cashbackPercent: string | number;
  discountPercent: string | number;
}

export async function GET() {
  try {
    await requireAdmin();
    const rows = await query<LevelWithCountRow>(
      `SELECT
         l.*,
         (SELECT COUNT(*) FROM "users" u WHERE u."loyaltyLevelId" = l."id") AS user_count
       FROM "loyalty_levels" l
       ORDER BY l."sortOrder" ASC`
    );

    const levels = rows.map((r) => ({
      id: r.id,
      name: r.name,
      minSpent: r.minSpent,
      cashbackPercent: r.cashbackPercent,
      discountPercent: r.discountPercent,
      sortOrder: r.sortOrder,
      _count: { users: Number(r.user_count) },
    }));

    return NextResponse.json({ levels });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { levels?: IncomingLevel[] };
    const levels = body.levels ?? [];

    await withTransaction(async (client) => {
      for (const level of levels) {
        await client.query(
          `UPDATE "loyalty_levels"
              SET name = $1,
                  "minSpent" = $2,
                  "cashbackPercent" = $3,
                  "discountPercent" = $4
            WHERE id = $5`,
          [
            level.name,
            parseFloat(String(level.minSpent)) || 0,
            parseFloat(String(level.cashbackPercent)) || 0,
            parseFloat(String(level.discountPercent)) || 0,
            level.id,
          ]
        );
      }
    });

    const updated = await query<LoyaltyLevelRow>(
      `SELECT id, name, "minSpent", "cashbackPercent", "discountPercent", "sortOrder"
         FROM "loyalty_levels"
        ORDER BY "sortOrder" ASC`
    );

    return NextResponse.json({ levels: updated });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
