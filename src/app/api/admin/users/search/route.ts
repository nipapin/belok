import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

interface SearchRow {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  has_subscription: boolean;
}

/**
 * GET /api/admin/users/search?q=foo
 * Returns up to 8 users matching the query in name or email,
 * with a flag indicating whether they currently have any push subscription.
 * Used by the admin notifications composer for autocomplete.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const like = `%${q}%`;
  const rows = await query<SearchRow>(
    `SELECT
       u.id, u.name, u.email, u."avatarUrl",
       EXISTS (
         SELECT 1 FROM "push_subscriptions" s WHERE s."userId" = u.id
       ) AS has_subscription
     FROM "users" u
     WHERE u.name ILIKE $1 OR u.email ILIKE $1
     ORDER BY u."createdAt" DESC
     LIMIT 8`,
    [like]
  );

  return NextResponse.json({ users: rows });
}
