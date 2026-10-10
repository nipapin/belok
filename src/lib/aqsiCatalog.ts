import 'server-only';
import { pool, query, queryOne } from '@/lib/db';
import { aqsiBulk, aqsiRequest } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import type { ProductRow, ProductVariantRow, CategoryRow } from '@/lib/types';

interface Good { id:string; group_id:string; name:string; price:number; nonTradable:boolean; tax:number; subject:number; paymentMethodType:number; type:string; unit:string; unitCode:number }
interface Category { id:string; name:string; defaultTax:number; defaultSubject:number; defaultPaymentMethodType:number; defaultUnit:string; defaultUnitCode:number }
interface Catalog { categories:Category[]; goods:Good[] }
interface Sync { revision:string; syncedRevision:string; submittedRevision:string; phase:string; taskId:string|null; pendingGoods:Catalog|null; knownGoods:Good[]; cursor:number; updatedAt:Date }

async function catalog(): Promise<Catalog> {
  const config = await getAqsiConfig();
  const [products,variants,categories] = await Promise.all([
    query<ProductRow>('SELECT * FROM products ORDER BY id'),
    query<ProductVariantRow>('SELECT * FROM product_variants ORDER BY id'),
    query<CategoryRow>('SELECT * FROM categories ORDER BY "sortOrder",id'),
  ]);
  return {
    categories:categories.map(c => ({id:`belok:${c.id}`,name:c.name.slice(0,256),defaultTax:config.taxRateId!,defaultSubject:1,defaultPaymentMethodType:config.calculationTypeId!,defaultUnit:'шт.',defaultUnitCode:0})),
    goods:products.flatMap(p => {
      const available = p.isAvailable && categories.some(c => c.id===p.categoryId && c.isActive);
      const vs = variants.filter(v => v.productId===p.id);
      return (vs.length ? vs : [null]).map(v => ({id:`belok:${v?.id || p.id}`,group_id:`belok:${p.categoryId}`,
        name:`${p.name}${v ? ` — ${v.name}` : ''}`.slice(0,128),price:Number(v?.price ?? p.price),nonTradable:!available,
        type:'simple',unit:'шт.',unitCode:0,tax:config.taxRateId!,subject:1,paymentMethodType:config.calculationTypeId!}));
    }),
  };
}

// Upserts use a private ID prefix and never remove unrelated aQsi goods.
// Verify actual entities through documented GET methods rather than guessing
// the undocumented response format of bulk-task status endpoints.
export async function processAqsiCatalog() {
  const config = await getAqsiConfig();
  if (!aqsiConfigured(config) || !config.catalogEnabled || !fiscalConfigured(config)) return;
  const client = await pool.connect();
  try {
    const lock = await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(784146,21) AS locked');
    if (!lock.rows[0].locked) return;
    try {
      const sync = await queryOne<Sync>('SELECT * FROM aqsi_catalog_sync WHERE id=1');
      if (!sync) return;
      if (sync.phase === 'IDLE') {
        if (sync.revision === sync.syncedRevision) return;
        const next = await catalog();
        const ids = new Set(next.goods.map(g => g.id));
        next.goods.push(...sync.knownGoods.filter(g => !ids.has(g.id)).map(g => ({...g,nonTradable:true})));
        if (!next.categories.length) {
          await query(`UPDATE aqsi_catalog_sync SET error='Нет категорий для синхронизации',"updatedAt"=NOW() WHERE id=1`); return;
        }
        await query(`UPDATE aqsi_catalog_sync SET phase='CATEGORIES',"submittedRevision"=$1,"pendingGoods"=$2,cursor=0,error=NULL,"updatedAt"=NOW() WHERE id=1`,[sync.revision,JSON.stringify(next)]);
        const id = await aqsiBulk('/v2/ListGoodsCategories',next.categories);
        await query(`UPDATE aqsi_catalog_sync SET "taskId"=$1 WHERE id=1`,[id]);
        return;
      }
      const pending = sync.pendingGoods;
      if (!pending) return;
      if (sync.phase === 'CATEGORIES') {
        const remote = await aqsiRequest<Category[]>('/v2/GoodsCategory/list');
        if (!Array.isArray(remote) || !pending.categories.every(c => remote.some(r => r.id===c.id && r.name===c.name && Number(r.defaultTax)===c.defaultTax && Number(r.defaultPaymentMethodType)===c.defaultPaymentMethodType))) {
          if (Date.now()-new Date(sync.updatedAt).getTime() > 120_000) {
            const id = await aqsiBulk('/v2/ListGoodsCategories',pending.categories);
            await query(`UPDATE aqsi_catalog_sync SET "taskId"=$1,"updatedAt"=NOW() WHERE id=1`,[id]);
          }
          return;
        }
        if (!pending.goods.length) {
          await query(`UPDATE aqsi_catalog_sync SET phase='IDLE',"syncedRevision"="submittedRevision",error=NULL,"updatedAt"=NOW() WHERE id=1`); return;
        }
        const id = await aqsiBulk('/v2/ListGoods',pending.goods);
        await query(`UPDATE aqsi_catalog_sync SET phase='GOODS',"taskId"=$1,"updatedAt"=NOW() WHERE id=1`,[id]);
        return;
      }
      if (sync.phase === 'GOODS') {
        let cursor = sync.cursor;
        for (const wanted of pending.goods.slice(cursor,cursor+5)) {
          const remote = await aqsiRequest<Good>(`/v2/Goods/${encodeURIComponent(wanted.id)}`);
          if (remote.name!==wanted.name || Math.round(Number(remote.price)*100)!==Math.round(wanted.price*100) ||
            remote.nonTradable!==wanted.nonTradable || Number(remote.tax)!==wanted.tax || Number(remote.paymentMethodType)!==wanted.paymentMethodType) {
            if (Date.now()-new Date(sync.updatedAt).getTime() > 120_000) {
              const id = await aqsiBulk('/v2/ListGoods',pending.goods);
              await query(`UPDATE aqsi_catalog_sync SET "taskId"=$1,"updatedAt"=NOW() WHERE id=1`,[id]);
            }
            return;
          }
          cursor++;
        }
        if (cursor===pending.goods.length) {
          await query(`UPDATE aqsi_catalog_sync SET phase='IDLE',"syncedRevision"="submittedRevision","knownGoods"=$1,"pendingGoods"=NULL,error=NULL,cursor=0,"updatedAt"=NOW() WHERE id=1`,[JSON.stringify(pending.goods)]);
        } else await query('UPDATE aqsi_catalog_sync SET cursor=$1,error=NULL WHERE id=1',[cursor]);
      }
    } catch {
      await query(`UPDATE aqsi_catalog_sync SET error='Загрузка каталога ожидает подтверждения aQsi. Проверьте доступ и налоговые параметры.' WHERE id=1`);
    } finally { await client.query('SELECT pg_advisory_unlock(784146,21)'); }
  } finally { client.release(); }
}
