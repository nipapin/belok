import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventoryAccess';
import { query } from '@/lib/db';
import { loadStockAvailability } from '@/lib/inventoryAvailability.server';
import { loadComboGroups } from '@/lib/combos';

export async function GET() {
  try {
    await requireInventoryPermission('view');
    const products = await query<{ id: string; name: string; isAvailable: boolean; isCombo: boolean; categoryActive: boolean }>(`SELECT p.id,p.name,p."isAvailable",p."isCombo",c."isActive" AS "categoryActive" FROM products p JOIN categories c ON c.id=p."categoryId" ORDER BY p.name`);
    const [stock, combos] = await Promise.all([loadStockAvailability(products.map(p => p.id)), loadComboGroups(products.filter(p => p.isCombo).map(p => p.id), true)]);
    const dishes = products.map(p => {
      let availability = stock.get(p.id)!;
      if (p.isCombo) {
        const groups = combos[p.id] ?? [];
        const missing = groups.filter(g => g.options.filter(o => o.available).length < g.minSelect);
        availability = groups.length ? { state: missing.length ? 'STOP' as const : 'AVAILABLE' as const, portions: null, reasons: missing.map(g => `Нет доступного выбора: ${g.name}`) } : { state: 'UNCONFIGURED', portions: null, reasons: ['Состав комбо не задан'] };
      }
      if (!p.isAvailable || !p.categoryActive) availability = { ...availability, state: 'STOP', reasons: ['Отключено в меню', ...availability.reasons] };
      return { ...p, ...availability };
    });
    return NextResponse.json({ dishes, updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (['UNAUTHORIZED', 'FORBIDDEN'].includes((error as Error).message)) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Inventory availability', error);
    return NextResponse.json({ error: 'Не удалось рассчитать стоп-лист' }, { status: 500 });
  }
}
