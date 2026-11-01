import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, query, queryOne, withTransaction } from '@/lib/db';
import { aqsiRequest, AqsiRequestError } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import { receiptPositions, receiptOrderReference, type FiscalItem } from '@/lib/aqsiReceipt';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';

interface CashJob { id:string;orderId:string;deviceId:number;state:string;payload:Record<string,unknown>|null;operationId:string|null;cancelRequested?:boolean }
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
  const order=await queryOne<{total:number;dailyNumber:number;createdAt:Date;status:string;paymentMethod:string}>(`SELECT total,"dailyNumber","createdAt",status,"paymentMethod" FROM orders WHERE id=$1`,[job.orderId]);
  if(!order || order.status==='CANCELLED') throw new Error('Заказ отменён');
  const items=await query<FiscalItem>(`SELECT "productId","variantId","fiscalName" AS name,quantity,"unitPrice" FROM order_items WHERE "orderId"=$1 ORDER BY id`,[job.orderId]);
  const positions=receiptPositions(items,Math.round(order.total*100),{...config,taxRateId:config.taxRateId!,calculationTypeId:config.calculationTypeId!});
  if(positions.length>170) throw new Error('Слишком много позиций для кассы');
  // Orders V2 uses rubles and ordinal SNO codes; Receipts V4 uses kopecks and bit masks.
  const taxationSystem=({1:0,2:1,4:2,16:4,32:5} as Record<number,number>)[config.taxSystemCode];
  return {id:`belok:${job.orderId}`,number:String(order.dailyNumber),dateTime:new Date(order.createdAt).toISOString(),
    device:String(job.deviceId),description:`Киоск · заказ #${order.dailyNumber} · ${order.paymentMethod === 'CARD' ? 'оплата на кассе' : 'наличные'}`,status:'Отложен',
    isEditableByDevice:false,ignoreItemCodeCheck:false,useTax20:false,
    content:{type:1,additionalAttribute:receiptOrderReference(job.orderId),additionalUserAttribute:{name:'Заказ',value:`#${order.dailyNumber}`},
      checkClose:{taxationSystem},
      positions:positions.map(p=>({positionId:randomUUID(),text:p.info.name,quantity:Number(p.info.baseQuantity),price:p.info.finalPrice/100,
        tax:p.info.taxRateId,paymentMethodType:4,paymentSubjectType:1,unitOfMeasurement:'шт.',unitCode:0,editable:false}))}};
}

async function setState(job:CashJob,state:string,error:string|null=null) {
  await query(`UPDATE aqsi_cash_orders SET state=$2,error=$3,"updatedAt"=NOW() WHERE id=$1`,[job.id,state,error]);
}

async function reconcile(job:CashJob,sendCancellation=true):Promise<'review'|void> {
  const remote=await aqsiRequest<RemoteOrder>(`/v2/Orders/simple/${encodeURIComponent(`belok:${job.orderId}`)}`);
  const marker=receiptOrderReference(job.orderId);
  if(Number(remote.device)!==job.deviceId || remote.content?.additionalAttribute!==marker) {
    await setState(job,'UNKNOWN','Заказ aQsi не соответствует заказу сайта');return 'review';
  }
  const receipts=remote.receipts ?? [];
  if(remote.status==='Оплачен') {
    const order=await queryOne<{total:number}>(`SELECT total FROM orders WHERE id=$1`,[job.orderId]);
    const receipt=receipts.length===1 ? receipts[0] : null;
    if(!order || !receipt || receipt.isNonFiscal!==false || !receipt.fp || !receipt.documentNumber || receipt.content?.type!==1 ||
      Math.round(receipt.amount*100)!==Math.round(order.total*100) || receipt.content.additionalAttribute!==marker) {
      await setState(job,'UNKNOWN','Оплата отмечена на кассе, но фискальный чек требует проверки');return 'review';
    }
    const paid = await withTransaction(async client=>{
      const updated = await client.query<{paymentMethod:string;status:string}>(`UPDATE orders SET "paymentStatus"='SUCCEEDED'
        WHERE id=$1 AND "paymentMethod" IN ('CASH','CARD') AND "paymentStatus"='PENDING' AND status!='CANCELLED'
        RETURNING "paymentMethod",status`,[job.orderId]);
      await client.query(`UPDATE aqsi_cash_orders SET state='SUCCEEDED',error=NULL,"operationId"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,receipt.id]);
      // The cashier already fiscalized and printed this receipt. Do not enqueue another.
      return updated.rows[0];
    });
    if (paid?.paymentMethod === 'CARD') await notifyKitchenNewOrder(job.orderId).catch(()=>console.error('Kitchen notify after deferred card payment failed'));
    if (paid?.status === 'COMPLETED') await settleOrderLoyalty(job.orderId,'COMPLETED');
  } else if(remote.status==='Отменен' && receipts.length===0) {
    const cancelled = await withTransaction(async client=>{
      return (await client.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING' RETURNING id`,[job.orderId])).rowCount === 1;
    });
    if (cancelled) {
      await setState(job,'CANCELLED');
      await settleOrderLoyalty(job.orderId,'CANCELLED');
    } else {
      await setState(job,'UNKNOWN','Оплата заказа уже изменилась. Проверьте заказ на кассе');return 'review';
    }
  } else if(remote.status==='Отложен' && receipts.length===0) {
    if(job.cancelRequested && sendCancellation) {
      const current=await queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id=$1`,[job.orderId]);
      if(current?.paymentStatus!=='PENDING') {
        await setState(job,'UNKNOWN','Оплата заказа уже изменилась. Проверьте заказ на кассе');return 'review';
      }
      // Orders V2 upserts by our stable external ID. Read before every retry:
      // never replace a paid/part-paid order or recreate an absent one.
      if(!job.payload) {await setState(job,'UNKNOWN','Нет сохранённого заказа для отмены aQsi');return 'review';}
      await aqsiRequest('/v2/Orders/simple','POST',{
        ...job.payload,id:`belok:${job.orderId}`,device:String(job.deviceId),
        status:'Отменен',cancellationReason:'Отменён сотрудником в админке',
      });
      // A successful command response is not confirmation of cancellation.
      return reconcile(job,false);
    } else await setState(job,'WAITING',job.cancelRequested ? 'Отмена отправлена. Ожидаем подтверждения aQsi' : null);
  }
  else {await setState(job,'UNKNOWN','Статус или частичная оплата заказа требуют проверки на кассе');return 'review';}
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
        try {await reconcile(job)} catch(error) {
          if(job.cancelRequested) await setState(job,'UNKNOWN',error instanceof AqsiRequestError ? error.message : 'Не удалось подтвердить отмену aQsi');
        }
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

/** Serialized with deferred-order submission and reconciliation on every server. */
export async function cancelAqsiCashOrder(orderId:string):Promise<'none'|'cancelled'|'pending'|'blocked'|'review'> {
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(784146,22)');
    const job=(await client.query<CashJob>(`SELECT * FROM aqsi_cash_orders WHERE "orderId"=$1`,[orderId])).rows[0];
    if(!job) return 'none';
    const order=await queryOne<{paymentStatus:string}>(`SELECT "paymentStatus" FROM orders WHERE id=$1`,[orderId]);
    if(order?.paymentStatus!=='PENDING' || job.state==='SUCCEEDED') return 'blocked';
    if(['QUEUED','BLOCKED','FAILED','CANCELLED'].includes(job.state)) {
      const cancelled=await withTransaction(async transaction=>{
        const updated=await transaction.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING' RETURNING id`,[orderId]);
        if(!updated.rowCount) return false;
        await transaction.query(`UPDATE aqsi_cash_orders SET state='CANCELLED',error=NULL,"updatedAt"=NOW() WHERE id=$1`,[job.id]);
        return true;
      });
      if(!cancelled) return 'blocked';
      await settleOrderLoyalty(orderId,'CANCELLED');
      return 'cancelled';
    }
    // Persist before calling the network. The worker resumes after a crash,
    // timeout or lost response and checks the remote order before resending.
    await query(`UPDATE aqsi_cash_orders SET "cancelRequested"=TRUE,"checkedAt"=NULL,"updatedAt"=NOW() WHERE id=$1`,[job.id]);
    job.cancelRequested=true;
    let review=false;
    try {review=await reconcile(job)==='review'} catch(error) {
      await setState(job,'UNKNOWN',error instanceof AqsiRequestError ? error.message : 'Не удалось подтвердить отмену aQsi');
    }
    const after=await queryOne<{state:string}>(`SELECT state FROM aqsi_cash_orders WHERE id=$1`,[job.id]);
    if(review) return 'review';
    return after?.state==='CANCELLED' ? 'cancelled' : after?.state==='SUCCEEDED' ? 'blocked' : 'pending';
  } finally {try {await client.query('SELECT pg_advisory_unlock(784146,22)')} finally {client.release()}}
}

// Cancel on the terminal first: a website cancellation must not leave a payable order on aQsi.
export async function cashOrderCancellationBlocked(orderId:string,cancelUnsent=false) {
  return withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(784146,22)');
    if(cancelUnsent) await client.query(`UPDATE aqsi_cash_orders SET state='CANCELLED',error='Отменён до передачи на кассу',"updatedAt"=NOW() WHERE "orderId"=$1 AND state IN ('QUEUED','BLOCKED','FAILED')`,[orderId]);
    return (await client.query(`SELECT id FROM aqsi_cash_orders WHERE "orderId"=$1 AND state!='CANCELLED'`,[orderId])).rowCount!==0;
  });
}
