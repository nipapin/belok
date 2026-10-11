import {NextRequest, NextResponse} from 'next/server';
import {query, withTransaction} from '@/lib/db';
import {requireInventoryPermission} from '@/lib/inventoryAccess';
import {applyStockOperation, type StockOperationInput} from '@/lib/inventoryOperations';
export const dynamic = 'force-dynamic';

const messages: Record<string,string> = {
  OPERATION_INVALID: 'Укажите позицию, операцию и причину.', QUANTITY_INVALID: 'Введите неотрицательное количество: до 3 знаков после запятой, для штук — целое.',
  QUANTITY_POSITIVE: 'Количество должно быть больше нуля.', STOCK_INSUFFICIENT: 'Недостаточно остатка для списания.', STOCK_LIMIT: 'Превышен максимальный остаток.',
  EXPECTED_REQUIRED: 'Обновите остаток перед инвентаризацией.', STOCK_CHANGED: 'Остаток изменился. Обновите данные и повторите инвентаризацию.',
  OPENING_EXISTS: 'Начальный остаток уже внесён. Используйте приход или инвентаризацию.', OPERATION_CONFLICT: 'Эта операция уже проведена с другими данными.',
  ITEM_NOT_FOUND: 'Позиция не найдена или архивирована.', USE_PRODUCTION: 'Для заготовки используйте выпуск партии по техкарте.',
};
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryPermission('stock');
    const input = await request.json().catch(() => null) as StockOperationInput;
    const result = await withTransaction(client => applyStockOperation(client, actor.id, input));
    return NextResponse.json(result, {status: result.replayed ? 200 : 201});
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['UNAUTHORIZED','FORBIDDEN'].includes(code)) return NextResponse.json({error:'Нет доступа'}, {status:403});
    if (messages[code]) return NextResponse.json({error:messages[code]}, {status:code === 'ITEM_NOT_FOUND' ? 404 : ['STOCK_CHANGED','OPERATION_CONFLICT','OPENING_EXISTS'].includes(code) ? 409 : 400});
    console.error('Inventory operation failed', error);
    return NextResponse.json({error:'Не удалось провести операцию. Проверьте складскую схему.'}, {status:500});
  }
}
export async function GET(request: NextRequest) {
  try {
    await requireInventoryPermission('view');
    const itemId = request.nextUrl.searchParams.get('itemId');
    if (itemId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) return NextResponse.json({error:'Некорректная позиция'}, {status:400});
    const movements = await query(`SELECT m.id,m.item_id::text AS "itemId",i.name AS "itemName",i.unit,m.reason,
      m.delta::text,m.quantity_after::text AS "quantityAfter",m.note,m.created_at AS "createdAt",
      COALESCE(u.name,u.email) AS "actorName"
      FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
      LEFT JOIN inventory_operations op ON op.id=m.operation_id LEFT JOIN users u ON u.id=op.actor_user_id
      WHERE ($1::uuid IS NULL OR m.item_id=$1::uuid) ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [itemId]);
    return NextResponse.json({movements}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    if (['UNAUTHORIZED','FORBIDDEN'].includes((error as Error).message)) return NextResponse.json({error:'Нет доступа'}, {status:403});
    console.error('Inventory movements failed', error);
    return NextResponse.json({error:'Не удалось загрузить движения склада.'}, {status:500});
  }
}
