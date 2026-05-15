import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import type { UserRow } from '@/lib/types';

interface UserListRow extends UserRow {
  ll_id: string | null;
  ll_name: string | null;
  ll_minSpent: number | null;
  ll_cashbackPercent: number | null;
  ll_discountPercent: number | null;
  ll_sortOrder: number | null;
  order_count: string;
}

export async function GET() {
  try {
    await requireAdmin();

    const rows = await query<UserListRow>(
      `SELECT
         u."id", u."email", u."emailVerifiedAt", u."passwordHash", u."phone", u."name",
         u."avatarUrl", u."role", u."bonusBalance", u."totalSpent", u."loyaltyLevelId",
         u."createdAt", u."updatedAt",
         l."id"          AS "ll_id",
         l."name"        AS "ll_name",
         l."minSpent"    AS "ll_minSpent",
         l."cashbackPercent" AS "ll_cashbackPercent",
         l."discountPercent" AS "ll_discountPercent",
         l."sortOrder"   AS "ll_sortOrder",
         (SELECT COUNT(*) FROM "orders" o WHERE o."userId" = u."id") AS order_count
       FROM "users" u
       LEFT JOIN "loyalty_levels" l ON l."id" = u."loyaltyLevelId"
       ORDER BY u."createdAt" DESC`
    );

    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      emailVerifiedAt: r.emailVerifiedAt,
      phone: r.phone,
      name: r.name,
      avatarUrl: r.avatarUrl,
      role: r.role,
      bonusBalance: r.bonusBalance,
      totalSpent: r.totalSpent,
      loyaltyLevelId: r.loyaltyLevelId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      loyaltyLevel: r.ll_id
        ? {
            id: r.ll_id,
            name: r.ll_name,
            minSpent: r.ll_minSpent,
            cashbackPercent: r.ll_cashbackPercent,
            discountPercent: r.ll_discountPercent,
            sortOrder: r.ll_sortOrder,
          }
        : null,
      _count: { orders: Number(r.order_count) },
    }));

    return NextResponse.json({ users });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
