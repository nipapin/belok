import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import {
  recordBroadcast,
  resolveAudienceUserIds,
  sendPushToUserIds,
  type Audience,
  type AudienceType,
} from '@/lib/push';

interface SendBody {
  title?: string;
  body?: string;
  url?: string;
  audience?: {
    type?: AudienceType;
    loyaltyLevelId?: string;
    userId?: string;
  };
}

function parseAudience(input: SendBody['audience']): Audience | { error: string } {
  if (!input || !input.type) return { error: 'Не указан тип аудитории' };
  if (input.type === 'ALL') return { type: 'ALL' };
  if (input.type === 'LOYALTY_LEVEL') {
    if (!input.loyaltyLevelId) return { error: 'Не выбран уровень лояльности' };
    return { type: 'LOYALTY_LEVEL', loyaltyLevelId: input.loyaltyLevelId };
  }
  if (input.type === 'USER') {
    if (!input.userId) return { error: 'Не выбран пользователь' };
    return { type: 'USER', userId: input.userId };
  }
  return { error: 'Неизвестный тип аудитории' };
}

/**
 * POST /api/admin/notifications
 * Body: { title, body, url?, audience: { type, loyaltyLevelId?, userId? } }
 * Sends a push to the resolved audience and records the broadcast in history.
 */
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as SendBody | null;
  const title = body?.title?.toString().trim();
  const text = body?.body?.toString().trim();
  const url = body?.url?.toString().trim() || undefined;

  if (!title) {
    return NextResponse.json({ error: 'Заголовок обязателен' }, { status: 400 });
  }
  if (title.length > 80) {
    return NextResponse.json({ error: 'Заголовок до 80 символов' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Текст обязателен' }, { status: 400 });
  }
  if (text.length > 240) {
    return NextResponse.json({ error: 'Текст до 240 символов' }, { status: 400 });
  }

  const audience = parseAudience(body?.audience);
  if ('error' in audience) {
    return NextResponse.json({ error: audience.error }, { status: 400 });
  }

  try {
    const userIds = await resolveAudienceUserIds(audience);
    const result = await sendPushToUserIds(userIds, {
      title,
      body: text,
      url,
      tag: 'broadcast',
    });

    await recordBroadcast({
      sentByUserId: admin.id,
      payload: { title, body: text, url },
      audience,
      recipients: result.recipients,
      delivered: result.delivered,
    });

    return NextResponse.json({
      ok: true,
      recipients: result.recipients,
      delivered: result.delivered,
    });
  } catch (e) {
    console.error('[admin/notifications POST]', e);
    return NextResponse.json({ error: 'Ошибка отправки' }, { status: 500 });
  }
}

interface HistoryRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audienceType: AudienceType;
  audienceValue: string | null;
  recipientCount: number;
  deliveredCount: number;
  createdAt: string;
  sender_name: string | null;
  sender_email: string | null;
  audience_label: string | null;
}

/**
 * GET /api/admin/notifications
 * Returns the most recent 50 broadcasts.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const rows = await query<HistoryRow>(
    `SELECT
       n.id, n.title, n.body, n.url,
       n."audienceType", n."audienceValue",
       n."recipientCount", n."deliveredCount", n."createdAt",
       u.name  AS sender_name,
       u.email AS sender_email,
       CASE
         WHEN n."audienceType" = 'LOYALTY_LEVEL' THEN ll.name
         WHEN n."audienceType" = 'USER'          THEN COALESCE(au.name, au.email)
         ELSE NULL
       END AS audience_label
     FROM "push_notifications" n
     LEFT JOIN "users"          u  ON u.id  = n."sentByUserId"
     LEFT JOIN "loyalty_levels" ll ON n."audienceType" = 'LOYALTY_LEVEL' AND ll.id = n."audienceValue"
     LEFT JOIN "users"          au ON n."audienceType" = 'USER'          AND au.id = n."audienceValue"
     ORDER BY n."createdAt" DESC
     LIMIT 50`
  );

  return NextResponse.json({
    notifications: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      audienceType: r.audienceType,
      audienceValue: r.audienceValue,
      audienceLabel: r.audience_label,
      recipientCount: r.recipientCount,
      deliveredCount: r.deliveredCount,
      createdAt: r.createdAt,
      sentBy: r.sender_name || r.sender_email,
    })),
  });
}
