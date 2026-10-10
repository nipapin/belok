import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, query, queryOne, withTransaction } from '@/lib/db';
import { aqsiRequest, AqsiRequestError } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import { receiptPositions, receiptOrderReference, type FiscalItem } from '@/lib/aqsiReceipt';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';

interface CashJob { id:string;orderId:string;deviceId:number;state:string;payload:Record<string,unknown>|null;operationId:string|null }
interface RemoteOrder {
  device:number;status:string;content:{additionalAttribute?:string};
  receipts?:{id:string;orderId?:string;isNonFiscal:boolean;amount:number;fp?:string;documentNumber?:number;content:{type:number;additionalAttribute?:string}}[];
}

export async function enqueueCashOrder(client:PoolClient,orderId:string,deviceId:number) {
  await client.query(`INSERT INTO aqsi_cash_orders (id,"orderId","deviceId") VALUES ($1,$2,$3) ON CONFLICT ("orderId") DO NOTHING`,[randomUUID(),orderId,deviceId]);
}

async function buildPayload(job:CashJob) {
  const config=await getAqsiConfig();
  if(!aqsiConfigured(config) || !config.cashOrdersEnabled || !fiscalConfigured(config)) return null;
  const order=await queryOne<{total:number;dailyNumber:number;createdAt:Date;status:string}>(`SELECT total,"dailyNumber","createdAt",status FROM orders WHERE id=$1`,[job.orderId]);
  if(!order || order.status==='CANCELLED') throw new Error('Заказ отменён');
  const items=await query<FiscalItem>(`SELECT "productId","variantId","fiscalName" AS name,quantity,"unitPrice" FROM order_items WHERE "orderId"=$1 ORDER BY id`,[job.orderId]);
  const positions=receiptPositions(items,Math.round(order.total*100),{...config,taxRateId:config.taxRateId!,calculationTypeId:config.calculationTypeId!});
  if(positions.length>170) throw new Error('Слишком много позиций для кассы');
  // Orders V2 uses rubles and ordinal SNO codes; Receipts V4 uses kopecks and bit masks.
  const taxationSystem=({1:0,2:1,4:2,16:4,32:5} as Record<number,number>)[config.taxSystemCode];
  return {id:`belok:${job.orderId}`,number:String(order.dailyNumber),dateTime:new Date(order.createdAt).toISOString(),
    device:String(job.deviceId),description:`Киоск · заказ #${order.dailyNumber} · наличные`,status:'Отложен',
    isEditableByDevice:false,ignoreItemCodeCheck:false,useTax20:false,
    content:{type:1,additionalAttribute:receiptOrderReference(job.orderId),additionalUserAttribute:{name:'Заказ',value:`#${order.dailyNumber}`},
      checkClose:{taxationSystem},
      positions:positions.map(p=>({positionId:randomUUID(),text:p.info.name,quantity:Number(p.info.baseQuantity),price:p.info.finalPrice/100,
        tax:p.info.taxRateId,paymentMethodType:4,paymentSubjectType:1,unitOfMeasurement:'шт.',unitCode:0,editable:false}))}};
}

async function setState(job:CashJob,state:string,error:string|null=null) {
  await query(`UPDATE aqsi_cash_orders SET state=$2,error=$3,"updatedAt"=NOW() WHERE id=$1`,[job.id,state,error]);
}

async function reconcile(job:CashJob) {
  const remote=await aqsiRequest<RemoteOrder>(`/v2/Orders/simple/${encodeURIComponent(`belok:${job.orderId}`)}`);
  const marker=receiptOrderReference(job.orderId);
  if(Number(remote.device)!==job.deviceId || remote.content?.additionalAttribute!==marker) {
    await setState(job,'UNKNOWN','Заказ aQsi не соответствует заказу сайта');return;
  }
  const receipts=remote.receipts ?? [];
  if(remote.status==='Оплачен') {
    const order=await queryOne<{total:number}>(`SELECT total FROM orders WHERE id=$1`,[job.orderId]);
    const receipt=receipts.length===1 ? receipts[0] : null;
    if(!order || !receipt || receipt.isNonFiscal!==false || !receipt.fp || !receipt.documentNumber || receipt.content?.type!==1 ||
      Math.round(receipt.amount*100)!==Math.round(order.total*100) || receipt.content.additionalAttribute!==marker) {
      await setState(job,'UNKNOWN','Оплата отмечена на кассе, но фискальный чек требует проверки');return;
    }
    await withTransaction(async client=>{
      await client.query(`UPDATE orders SET "paymentStatus"='SUCCEEDED' WHERE id=$1 AND "paymentMethod"='CASH'`,[job.orderId]);
      await client.query(`UPDATE aqsi_cash_orders SET state='SUCCEEDED',error=NULL,"operationId"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,receipt.id]);
      // The cashier already fiscalized and printed this receipt. Do not enqueue another.
    });
  } else if(remote.status==='Отменен' && receipts.length===0) {
    await withTransaction(async client=>{
      await client.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[job.orderId]);
    });
    await settleOrderLoyalty(job.orderId,'CANCELLED');
    await setState(job,'CANCELLED');
  } else if(remote.status==='Отложен' && receipts.length===0) await setState(job,'WAITING');
  else await setState(job,'UNKNOWN','Статус или частичная оплата заказа требуют проверки на кассе');
}

export async function processAqsiCashOrders() {
  if(!process.env.AQSI_API_KEY?.trim()) return;
  const client=await pool.connect();
  try {
    if(!(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(784146,22) AS locked')).rows[0].locked) return;
    try {
      await query(`UPDATE aqsi_cash_orders SET state='UNKNOWN',error='Отправка прервана; проверяем заказ без повторной отправки' WHERE state='SUBMITTING'`);
      const active=await query<CashJob>(`SELECT * FROM aqsi_cash_orders WHERE state IN ('WAITING','UNKNOWN') AND ("checkedAt" IS NULL OR "checkedAt"<NOW()-INTERVAL '10 seconds') ORDER BY "checkedAt" NULLS FIRST LIMIT 10`);
      for(const job of active) {
        await query(`UPDATE aqsi_cash_orders SET "checkedAt"=NOW() WHERE id=$1`,[job.id]);
        try {await reconcile(job)} catch { /* Read-only retry; never recreate an uncertain order. */ }
      }
      const config=await getAqsiConfig();
      if(!aqsiConfigured(config) || !config.cashOrdersEnabled) return;
      for(const job of await query<CashJob>(`SELECT * FROM aqsi_cash_orders WHERE state IN ('QUEUED','BLOCKED') ORDER BY "createdAt" LIMIT 10`)) {
        let payload=job.payload;
        try {payload ??=await buildPayload(job)} catch(error) {await setState(job,'FAILED',(error as Error).message);continue}
        if(!payload) {await setState(job,'BLOCKED','Проверьте налоговые настройки aQsi');continue}
        await query(`UPDATE aqsi_cash_orders SET state='SUBMITTING',payload=$2,"submittedAt"=NOW(),error=NULL WHERE id=$1`,[job.id,JSON.stringify(payload)]);
        try {
          const response=await aqsiRequest<{guid:string}>('/v2/Orders/simple','POST',payload);
          if(!response?.guid) throw new AqsiRequestError('Нет ID отложенного заказа',true);
          await query(`UPDATE aqsi_cash_orders SET state='WAITING',"operationId"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,response.guid]);
        } catch(error) {
          await setState(job,error instanceof AqsiRequestError && !error.ambiguous ? 'FAILED' : 'UNKNOWN',error instanceof AqsiRequestError ? error.message : 'Проверьте передачу заказа на кассу');
        }
      }
    } finally {await client.query('SELECT pg_advisory_unlock(784146,22)')}
  } finally {client.release()}
}

// Cancel on the terminal first: a website cancellation must not leave a payable order on aQsi.
export async function cashOrderCancellationBlocked(orderId:string,cancelUnsent=false) {
  return withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(784146,22)');
    if(cancelUnsent) await client.query(`UPDATE aqsi_cash_orders SET state='CANCELLED',error='Отменён до передачи на кассу',"updatedAt"=NOW() WHERE "orderId"=$1 AND state IN ('QUEUED','BLOCKED','FAILED')`,[orderId]);
    return (await client.query(`SELECT id FROM aqsi_cash_orders WHERE "orderId"=$1 AND state!='CANCELLED'`,[orderId])).rowCount!==0;
  });
}
