import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '@/lib/auth';
import { isInKaliningrad } from '@/lib/kaliningrad';
import { query, queryOne } from '@/lib/db';

type SavedAddress = {
  id: string;
  name: string;
  label: string;
  lat: number;
  lon: number;
};

const COLUMNS = `"id", "name", "label", "lat", "lon"`;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const items = await query<SavedAddress>(
    `SELECT ${COLUMNS} FROM "saved_addresses" WHERE "userId" = $1 ORDER BY "name" ASC`,
    [user.id]
  );
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; label?: unknown; lat?: unknown; lon?: unknown }
    | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const lat = typeof body?.lat === 'number' ? body.lat : Number.NaN;
  const lon = typeof body?.lon === 'number' ? body.lon : Number.NaN;

  if (name.length < 1 || name.length > 40) {
    return NextResponse.json({ error: 'Укажите имя адреса' }, { status: 400 });
  }
  if (label.length < 2 || label.length > 240) {
    return NextResponse.json({ error: 'Укажите адрес' }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInKaliningrad(lat, lon)) {
    return NextResponse.json({ error: 'Адрес должен быть в Калининграде' }, { status: 400 });
  }

  const count = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "saved_addresses" WHERE "userId" = $1`,
    [user.id]
  );
  const existing = await queryOne<{ id: string }>(
    `SELECT "id" FROM "saved_addresses" WHERE "userId" = $1 AND lower("name") = lower($2)`,
    [user.id, name]
  );
  if (!existing && Number(count?.n ?? 0) >= 20) {
    return NextResponse.json({ error: 'Можно сохранить не больше 20 адресов' }, { status: 400 });
  }

  const item = existing
    ? await queryOne<SavedAddress>(
        `UPDATE "saved_addresses"
            SET "name" = $2, "label" = $3, "lat" = $4, "lon" = $5
          WHERE "id" = $1
          RETURNING ${COLUMNS}`,
        [existing.id, name, label, lat, lon]
      )
    : await queryOne<SavedAddress>(
        `INSERT INTO "saved_addresses"("id", "userId", "name", "label", "lat", "lon")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNS}`,
        [uuidv4(), user.id, name, label, lat, lon]
      );

  if (!item) return NextResponse.json({ error: 'Не удалось сохранить адрес' }, { status: 500 });
  return NextResponse.json({ item });
}
