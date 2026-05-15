import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { getUserWithLoyaltyById } from '@/lib/auth';

interface UpdateUserBody {
  role?: 'USER' | 'ADMIN';
  bonusBalance?: string | number;
  loyaltyLevelId?: string | null;
  bonusAdjustment?: string | number;
  bonusReason?: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as UpdateUserBody;

    await withTransaction(async (client) => {
      const sets: string[] = [];
      const sqlParams: unknown[] = [];
      function add(column: string, value: unknown) {
        sqlParams.push(value);
        sets.push(`"${column}" = $${sqlParams.length}`);
      }
      if (body.role !== undefined) add('role', body.role);
      if (body.bonusBalance !== undefined) {
        add('bonusBalance', parseFloat(String(body.bonusBalance)) || 0);
      }
      if (body.loyaltyLevelId !== undefined) add('loyaltyLevelId', body.loyaltyLevelId);

      if (sets.length > 0) {
        sqlParams.push(id);
        await client.query(
          `UPDATE "users" SET ${sets.join(', ')} WHERE id = $${sqlParams.length}`,
          sqlParams
        );
      }

      if (body.bonusAdjustment !== undefined && body.bonusAdjustment !== '') {
        await client.query(
          `INSERT INTO "bonus_transactions"
             (id, "userId", amount, type, description)
           VALUES ($1, $2, $3, 'MANUAL', $4)`,
          [
            uuidv4(),
            id,
            parseFloat(String(body.bonusAdjustment)) || 0,
            body.bonusReason || 'Ручная корректировка администратором',
          ]
        );
      }
    });

    const user = await getUserWithLoyaltyById(id);
    return NextResponse.json({ user });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
