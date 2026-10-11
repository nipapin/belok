import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { validStaffRoles, canAssignRoles, hasPermission } from '@/lib/roles';
import { staffRolesKey, writeStaffAudit } from '@/lib/staffAccess';
import { toClientUser } from '@/lib/userClient';
import { getUserWithLoyaltyById } from '@/lib/auth';

interface UpdateUserBody {
  role?: 'USER' | 'ADMIN';
  staffRoles?: unknown;
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
    let actor = await requireAdmin('people');
    const { id } = await params;
    const body = (await request.json()) as UpdateUserBody;

    if (body.role !== undefined && (!['USER', 'ADMIN'].includes(body.role) || !hasPermission(actor, 'settings'))) {
      return NextResponse.json({ error: 'Изменение исходной роли недоступно' }, { status: 403 });
    }
    if (body.staffRoles !== undefined && body.staffRoles !== null && !validStaffRoles(body.staffRoles)) {
      return NextResponse.json({ error: 'Выберите корректные роли. Клиент не совмещается с рабочими ролями.' }, { status: 400 });
    }
    await withTransaction(async (client) => {
      // Serialize all assignments, including checks protecting privileged accounts.
      await client.query('SELECT pg_advisory_xact_lock($1)', [77134813]);
      actor = await requireAdmin('people');
      if (body.role !== undefined && !hasPermission(actor,'settings')) throw Error('UNAUTHORIZED');
      const target = await getUserWithLoyaltyById(id);
      if (!target) throw Error('NOT_FOUND');
      if (!canAssignRoles(actor, target, body.staffRoles === undefined ? target.staffRoles ?? null : body.staffRoles as string[] | null)) throw Error('UNAUTHORIZED');
      if (body.staffRoles !== undefined) {
        if (actor.id === id && !hasPermission({role: target.role, staffRoles: body.staffRoles as string[] | null}, 'settings')) throw Error('SELF_ROLE_CHANGE');
        const previous = target.staffRoles ?? null;
        if (body.staffRoles === null) {
          await client.query('DELETE FROM app_settings WHERE key=$1', [staffRolesKey(id)]);
        } else {
          await client.query(`INSERT INTO app_settings(key,value,"updatedAt") VALUES($1,$2::jsonb,NOW())
            ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=NOW()`,
            [staffRolesKey(id), JSON.stringify({ roles: body.staffRoles, grantedBy: actor.id })]);
        }
        await writeStaffAudit(client, actor.id, 'EMPLOYEE_ROLES', id, { before: previous, after: body.staffRoles });
      }

      const sets: string[] = [];
      const sqlParams: unknown[] = [];
      function add(column: string, value: unknown) {
        sqlParams.push(value);
        sets.push(`"${column}" = $${sqlParams.length}`);
      }
      if (body.role !== undefined) {
        if (actor.id === id && !hasPermission({role: body.role, staffRoles: body.staffRoles === undefined ? target.staffRoles : body.staffRoles as string[] | null}, 'settings')) throw Error('SELF_ROLE_CHANGE');
        add('role', body.role);
        await writeStaffAudit(client, actor.id, 'LEGACY_ROLE', id, {before: target.role, after: body.role});
      }
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
    return NextResponse.json({ user: user ? toClientUser(user) : null });
  } catch (e) {
    if ((e as Error).message === 'SELF_ROLE_CHANGE') return NextResponse.json({ error: 'Нельзя снять у себя административный доступ.' }, { status: 409 });
    if ((e as Error).message === 'NOT_FOUND') return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}
