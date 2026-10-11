import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { withTransaction } from '@/lib/db';
import { reportCsv, reportPeriod, type ReportRow } from '@/lib/managerReports';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const p = new URL(request.url).searchParams;
    let period;
    try { period = reportPeriod(p.get('from') ?? '', p.get('to') ?? ''); }
    catch { return NextResponse.json({ error: 'Выберите корректные даты начала и конца периода' }, { status: 400 }); }
    const page = Number(p.get('page') ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return NextResponse.json({ error: 'Некорректная страница' }, { status: 400 });
    const search = (p.get('search') ?? '').trim().slice(0, 160);
    const payment = p.get('payment') ?? '';
    if (payment && !['CARD', 'CASH', 'SBP', 'BONUS'].includes(payment)) return NextResponse.json({ error: 'Некорректный тип оплаты' }, { status: 400 });
    const exportCsv = p.get('format') === 'csv';
    const values = [period.start, period.end, `%${search.replace(/[\\%_]/g, '\\$&')}%`, payment, p.get('cancelled') === 'true'];
    const cte = `WITH selected_orders AS (
      SELECT o.* FROM orders o WHERE o."createdAt" >= ($1::timestamptz AT TIME ZONE 'UTC')
      AND o."createdAt" < ($2::timestamptz AT TIME ZONE 'UTC')
      AND ($4='' OR o."paymentMethod"::text=$4) AND ($5::boolean OR o.status::text<>'CANCELLED')
      AND ($3='%%' OR EXISTS (SELECT 1 FROM order_items si JOIN products sp ON sp.id=si."productId"
        WHERE si."orderId"=o.id AND (sp.name ILIKE $3 OR si."variantName" ILIKE $3)))
    ), selected_items AS (
      SELECT i.*, p.name AS "productName" FROM order_items i JOIN products p ON p.id=i."productId"
      JOIN selected_orders o ON o.id=i."orderId"
      WHERE $3='%%' OR p.name ILIKE $3 OR i."variantName" ILIKE $3
    )`;
    const data = await withTransaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const summary = await client.query(cte + ` SELECT
        (SELECT count(*)::int FROM selected_orders) AS orders,
        (SELECT COALESCE(sum(quantity),0)::int FROM selected_items) AS quantity,
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders) AS total,
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE "paymentStatus"::text='SUCCEEDED') AS paid,
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE "paymentMethod"::text='CASH') AS "cashTotal",
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE "paymentMethod"::text='CASH' AND "paymentStatus"::text='SUCCEEDED') AS "cashPaid",
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE "paymentMethod"::text IN ('CARD','SBP')) AS "nonCashTotal",
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE "paymentMethod"::text IN ('CARD','SBP') AND "paymentStatus"::text='SUCCEEDED') AS "nonCashPaid",
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE COALESCE("paymentMethod"::text,'') NOT IN ('CASH','CARD','SBP')) AS "otherTotal",
        (SELECT COALESCE(sum(total),0)::float8 FROM selected_orders WHERE COALESCE("paymentMethod"::text,'') NOT IN ('CASH','CARD','SBP') AND "paymentStatus"::text='SUCCEEDED') AS "otherPaid",
        (SELECT count(*)::int FROM selected_items) AS count`, values);
      // A bounded export keeps a multi-year request from exhausting server memory.
      if (exportCsv && summary.rows[0].count > 100000) return null;
      const rows = await client.query<ReportRow>(cte + ` SELECT i.id, o.id AS "orderId", o."dailyNumber",
        o."createdAt" AT TIME ZONE 'UTC' AS "createdAt", i."productName", i."variantName", i.quantity,
        i."unitPrice"::float8 AS "unitPrice", o.total::float8 AS "orderTotal", o."paymentMethod",
        o."paymentStatus", o.status, o.comment FROM selected_items i JOIN selected_orders o ON o.id=i."orderId"
        ORDER BY o."createdAt" DESC, o.id DESC, i.id ASC LIMIT $6 OFFSET $7`, [...values, exportCsv ? 100000 : 50, exportCsv ? 0 : (page - 1) * 50]);
      const { count, ...totals } = summary.rows[0];
      return { rows: rows.rows, summary: totals, count, page };
    });
    if (!data) return NextResponse.json({ error: 'В отчете больше 100 000 позиций. Для выгрузки выберите меньший период.' }, { status: 422 });
    if (exportCsv) return new NextResponse(reportCsv(data.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="report-${p.get('from')}-${p.get('to')}.csv"`, 'Cache-Control': 'no-store' } });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Manager report', error);
    return NextResponse.json({ error: 'Не удалось сформировать отчет' }, { status: 500 });
  }
}
