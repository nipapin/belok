import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { query } from '@/lib/db';
export async function GET() {
  try {
    await requireAdmin('audit');
    const entries = await query(`SELECT a.value, COALESCE(u.name,u.email,u.phone) AS "actorName", COALESCE(t.name,t.email,t.phone) AS "targetName"
      FROM app_settings a LEFT JOIN users u ON u.id=a.value->>'actorId' LEFT JOIN users t ON t.id=a.value->>'targetId'
      WHERE a.key LIKE 'staff_audit:%' ORDER BY a."updatedAt" DESC, a.key DESC LIMIT 200`);
    return NextResponse.json({entries}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    return NextResponse.json({error:'Нет доступа к журналу'}, {status:(error as Error).message === 'UNAUTHORIZED' ? 403 : 500});
  }
}
