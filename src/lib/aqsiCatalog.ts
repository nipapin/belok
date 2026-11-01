import 'server-only';
import { pool, query, queryOne } from '@/lib/db';
import { aqsiBulk, aqsiRequest } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import type { ProductRow, ProductVariantRow, CategoryRow } from '@/lib/types';

interface Good { id:string; group_id:string; name:string; price:number; nonTradable:boolean; tax:number; subject:number; paymentMethodType:number; type:string; unit:string; unitCode:number }
interface Category { id:string; name:string; defaultTax:number; defaultSubject:number; defaultPaymentMethodType:number; defaultUnit:string; defaultUnitCode:number; shared?:boolean }
interface RemoteCategory { id:string; name:string; children?:RemoteCategory[] | null; defaultTax?:number; defaultPaymentMethodType?:number }
interface Catalog { categories:Category[]; goods:Good[] }
interface Sync { revision:string; syncedRevision:string; submittedRevision:string; phase:string; taskId:string|null; pendingGoods:Catalog|null; knownGoods:Good[]; cursor:number; updatedAt:Date; error:string|null }

class CatalogSyncError extends Error {}
const categoryName = (name:string) => name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');

// Reuse a unique existing category without changing its fiscal defaults or
// unrelated goods. Persist the provider ID in the pending snapshot, including
// the group_id of every product, so retries use the same relationship.
export function reconcileCategories(pending:Catalog, roots:RemoteCategory[]):Catalog {
  const remote:RemoteCategory[]=[];
  const visit=(items:RemoteCategory[])=>{for(const item of items){remote.push(item);if(Array.isArray(item.children))visit(item.children)}};
  visit(roots);
  const mapping=new Map<string,string>();
  const categories:Category[]=[];
  for(const wanted of pending.categories) {
    const owned=remote.find(r=>r.id===wanted.id);
    const matches=remote.filter(r=>typeof r.name==='string' && categoryName(r.name)===categoryName(wanted.name));
    const ids=new Set(matches.map(r=>r.id));
    if(!owned && ids.size>1) throw new CatalogSyncError(`Несколько категорий aQsi с названием «${wanted.name.trim()}». Уточните соответствие перед синхронизацией.`);
    const existing=owned ?? matches[0];
    if(existing && (typeof existing.id!=='string' || !existing.id)) throw new CatalogSyncError(`У категории aQsi «${wanted.name.trim()}» отсутствует внешний ID.`);
    const already=categories.find(c=>categoryName(c.name)===categoryName(wanted.name));
    const id=existing?.id ?? already?.id ?? wanted.id;
    mapping.set(wanted.id,id);
    if(!categories.some(c=>c.id===id)) categories.push({...wanted,id,
      name:existing?.name ?? wanted.name.trim(),
      shared:Boolean(wanted.shared || (existing && existing.id!==wanted.id))});
  }
  return {categories,goods:pending.goods.map(g=>({...g,group_id:mapping.get(g.group_id) ?? g.group_id}))};
}

async function checkBulkError(path:string, taskId:string|null) {
  if(!taskId) return;
  const status=await aqsiRequest<{status?:string;errorText?:string}>(`${path}/${encodeURIComponent(taskId)}/status`);
  if(status?.status?.toLowerCase()==='error') {
    const detail=typeof status.errorText==='string' ? status.errorText.replace(/[\x00-\x1f]/g,' ').slice(0,500) : 'Ошибка обработки пакета';
    throw new CatalogSyncError(`aQsi: ${detail}`);
  }
}

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
        name:`${p.name}${v ? ` — ${v.name}` : ''}`.trim().slice(0,128),price:Number(v?.price ?? p.price),nonTradable:!available,
        type:'simple',unit:'шт.',unitCode:0,tax:config.taxRateId!,subject:1,paymentMethodType:config.calculationTypeId!}));
    }),
  };
}

// Goods use a private ID prefix; shared categories are reused without updating
// their defaults. No upload removes unrelated aQsi goods or categories.
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
      // A manual sync or catalog edit retries a rejected snapshot under the
      // same worker lock; never reset it concurrently from an HTTP handler.
      if(sync.error && sync.revision!==sync.submittedRevision) {
        await query(`UPDATE aqsi_catalog_sync SET phase='IDLE',"taskId"=NULL,"pendingGoods"=NULL,error=NULL,cursor=0 WHERE id=1`);
        return;
      }
      if (sync.phase === 'IDLE') {
        if (sync.revision === sync.syncedRevision) return;
        const next = await catalog();
        const ids = new Set(next.goods.map(g => g.id));
        next.goods.push(...sync.knownGoods.filter(g => !ids.has(g.id)).map(g => ({...g,nonTradable:true})));
        if (!next.categories.length) {
          await query(`UPDATE aqsi_catalog_sync SET error='Нет категорий для синхронизации',"updatedAt"=NOW() WHERE id=1`); return;
        }
        await query(`UPDATE aqsi_catalog_sync SET phase='CATEGORIES',"submittedRevision"=$1,"pendingGoods"=$2,cursor=0,error=NULL,"updatedAt"=NOW() WHERE id=1`,[sync.revision,JSON.stringify(next)]);
        await query('UPDATE aqsi_catalog_sync SET "taskId"=NULL WHERE id=1');
        return;
      }
      let pending = sync.pendingGoods;
      if (!pending) return;
      if (sync.phase === 'CATEGORIES') {
        const roots = await aqsiRequest<RemoteCategory[]>('/v2/GoodsCategory/list');
        if(!Array.isArray(roots)) throw new CatalogSyncError('aQsi вернул некорректный список категорий');
        const reconciled=reconcileCategories(pending,roots);
        if(JSON.stringify(reconciled)!==JSON.stringify(pending)) {
          pending=reconciled;
          sync.taskId=null;
          await query(`UPDATE aqsi_catalog_sync SET "pendingGoods"=$1,"taskId"=NULL,error=NULL WHERE id=1`,[JSON.stringify(pending)]);
        }
        const remote:RemoteCategory[]=[];
        const visit=(items:RemoteCategory[])=>{for(const r of items){remote.push(r);if(Array.isArray(r.children))visit(r.children)}};
        visit(roots);
        const missing=pending.categories.filter(c=>!remote.some(r=>r.id===c.id && r.name===c.name &&
          (c.shared || (Number(r.defaultTax)===c.defaultTax && Number(r.defaultPaymentMethodType)===c.defaultPaymentMethodType))));
        if (missing.length) {
          await checkBulkError('/v2/ListGoodsCategories',sync.taskId);
          if (!sync.taskId || Date.now()-new Date(sync.updatedAt).getTime() > 120_000) {
            const id = await aqsiBulk('/v2/ListGoodsCategories',missing.map(c=>{
              const payload={...c};delete payload.shared;return payload;
            }));
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
        await checkBulkError('/v2/ListGoods',sync.taskId);
        let cursor = sync.cursor;
        for (const wanted of pending.goods.slice(cursor,cursor+5)) {
          const remote = await aqsiRequest<Good>(`/v2/Goods/${encodeURIComponent(wanted.id)}`);
          // aQsi trims product names, including already submitted snapshots.
          if (remote.name?.trim()!==wanted.name.trim() || remote.group_id!==wanted.group_id || Math.round(Number(remote.price)*100)!==Math.round(wanted.price*100) ||
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
    } catch(error) {
      await query('UPDATE aqsi_catalog_sync SET error=$1 WHERE id=1',[
        error instanceof CatalogSyncError ? error.message : 'Загрузка каталога ожидает подтверждения aQsi. Проверьте доступ и налоговые параметры.'
      ]);
    } finally { await client.query('SELECT pg_advisory_unlock(784146,21)'); }
  } finally { client.release(); }
}
