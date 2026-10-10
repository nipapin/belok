import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, query, queryOne, withTransaction } from '@/lib/db';
import { aqsiRequest, AqsiRequestError, type AqsiOperation } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import { receiptPositions, receiptOrderReference, parsePurchaseResult, parseReceiptResult, type FiscalItem } from '@/lib/aqsiReceipt';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';

export interface AqsiJob {
  id: string; orderId: string; deviceId: number; kind: 'CARD' | 'RECEIPT';
  state: 'QUEUED' | 'SUBMITTING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'BLOCKED';
  payload: Record<string, unknown> | null; operationId: string | null;
  result: Record<string, unknown> | null; error: string | null; createdAt: Date;
}

export async function enqueueCard(client: PoolClient, orderId: string, total: number, deviceId: number) {
  await client.query(`INSERT INTO aqsi_jobs (id,"orderId",kind,"deviceId",payload)
    VALUES ($1,$2,'CARD',$3,$4) ON CONFLICT ("orderId",kind) DO NOTHING`,
    [randomUUID(),orderId,deviceId,JSON.stringify({deviceId,amount:Math.round(total*100),mode:'card_only',ttlMillis:120_000,printCount:0})]);
}

// Insert in the same transaction that commits payment success. A process crash
// or repeated bank notification cannot lose the receipt or enqueue it twice.
export async function enqueueReceipt(client: PoolClient, orderId: string) {
  const config = await getAqsiConfig();
  if (!config.deviceId) return;
  await client.query(`INSERT INTO aqsi_jobs (id,"orderId",kind,"deviceId")
    SELECT $1,id,'RECEIPT',$3 FROM orders WHERE id=$2 AND source='KIOSK' AND "paymentMethod" IN ('CARD','SBP')
    ON CONFLICT ("orderId",kind) DO NOTHING`, [randomUUID(),orderId,config.deviceId]);
}

async function buildReceipt(job: AqsiJob) {
  const config = await getAqsiConfig();
  if (!aqsiConfigured(config) || !config.receiptsEnabled || !fiscalConfigured(config)) return null;
  const order = await queryOne<{total:number;paymentStatus:string;dailyNumber:number;email:string|null}>(
    `SELECT o.total,o."paymentStatus",o."dailyNumber",COALESCE(o."guestEmail",u.email) AS email
     FROM orders o LEFT JOIN users u ON u.id=o."userId" WHERE o.id=$1`,[job.orderId]);
  if (!order || order.paymentStatus !== 'SUCCEEDED') return null;
  const items = await query<FiscalItem>(`SELECT "productId","variantId","fiscalName" AS name,quantity,"unitPrice"
    FROM order_items WHERE "orderId"=$1 ORDER BY id`,[job.orderId]);
  const positions = receiptPositions(items,Math.round(order.total*100),{
    ...config, taxRateId:config.taxRateId!, calculationTypeId:config.calculationTypeId!,
  });
  if (positions.length > 100) throw new Error('Слишком много позиций для кассы');
  const card = await queryOne<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE "orderId"=$1 AND kind='CARD' AND state='SUCCEEDED'`,[job.orderId]);
  return { deviceId:job.deviceId,typeId:1,ttlMillis:86_400_000,ignoreItemCodeCheck:false,skipPrinting:false,
    roundAmountDownToExponent:0,
    info:{taxSystemCode:config.taxSystemCode,isOnline:false,additionalAttribute:receiptOrderReference(job.orderId),
      additionalUserAttribute:{name:'Заказ',value:`#${order.dailyNumber} ${job.orderId}`},
      ...(order.email ? {customerInfo:{emailOrPhone:order.email}} : {}),
      ...(config.cashierName ? {cashierInfo:{positionAndSurname:config.cashierName}} : {})},
    positions,payments:[{type:1,amount:Math.round(order.total*100),...(card?.result ? {slip:card.result} : {})}],
  };
}

async function setJob(job: AqsiJob, state: AqsiJob['state'], error: string | null = null) {
  await query(`UPDATE aqsi_jobs SET state=$2,error=$3,"updatedAt"=NOW() WHERE id=$1`,[job.id,state,error]);
}

async function applyOperation(job: AqsiJob, operation: AqsiOperation) {
  if (operation.deviceId !== job.deviceId || operation.operationId !== job.operationId ||
    operation.type !== (job.kind === 'CARD' ? 'acquiring.purchase' : 'receipt.process')) {
    await setJob(job,'UNKNOWN','Операция не соответствует заказу'); return;
  }
  if (operation.status === 'Completed') {
    let result: Record<string,unknown> | null = null;
    try {
      result = job.kind === 'CARD' ? parsePurchaseResult(operation.result,Number(job.payload?.amount)) : parseReceiptResult(operation.result,job.payload!);
    } catch { await setJob(job,'UNKNOWN','Результат операции требует проверки'); return; }
    let paid = false;
    await withTransaction(async client => {
      await client.query(`UPDATE aqsi_jobs SET state='SUCCEEDED',result=$2,error=NULL,"updatedAt"=NOW() WHERE id=$1`,[job.id,JSON.stringify(result)]);
      if (job.kind === 'CARD') {
        const updated = await client.query(`UPDATE orders SET "paymentStatus"='SUCCEEDED' WHERE id=$1 AND "paymentStatus"='PENDING' RETURNING id`,[job.orderId]);
        paid = updated.rowCount === 1;
        await enqueueReceipt(client,job.orderId);
      }
    });
    if (paid) await notifyKitchenNewOrder(job.orderId).catch(() => console.error('Kitchen notify after aQsi payment failed'));
  } else if (['Canceled','Timeout','Error'].includes(operation.status)) {
    if(operation.result) {
      await setJob(job,'UNKNOWN','Операция завершилась с ошибкой и данными результата. Проверьте оплату/чек в aQsi.');
      return;
    }
    const details=[operation.problems,operation.message].filter(Boolean).join(': ').slice(0,300);
    await setJob(job,'FAILED',`aQsi: ${operation.status}${details ? ` (${details})` : ''}`);
    if (job.kind === 'CARD') {
      await query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[job.orderId]);
      await settleOrderLoyalty(job.orderId,'CANCELLED');
    }
  }
}

export async function processAqsiJobs() {
  if (!process.env.AQSI_API_KEY?.trim()) return;
  const client = await pool.connect();
  try {
    const lock = await client.query<{locked:boolean}>(`SELECT pg_try_advisory_lock(784146,20) AS locked`);
    if (!lock.rows[0].locked) return;
    try {
      // An abandoned SUBMITTING row may have reached aQsi. Never resend it.
      await client.query(`UPDATE aqsi_jobs SET state='UNKNOWN',error='Отправка прервана. Проверьте операцию в aQsi.',"updatedAt"=NOW() WHERE state='SUBMITTING'`);
      const failures=await query<AqsiJob>(`SELECT j.* FROM aqsi_jobs j JOIN orders o ON o.id=j."orderId" WHERE j.kind='CARD' AND j.state='FAILED' AND o."paymentStatus"='PENDING' LIMIT 20`);
      for(const job of failures) {
        await query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[job.orderId]);
        await settleOrderLoyalty(job.orderId,'CANCELLED');
      }
      const active = await query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE state='PROCESSING' ORDER BY "createdAt" LIMIT 20`);
      for (const job of active) {
        try { await applyOperation(job,await aqsiRequest<AqsiOperation>(`/v4/Operations/${job.operationId}`)); }
        catch { /* GET can safely be retried on the next worker tick. */ }
      }
      const config = await getAqsiConfig();
      if (!aqsiConfigured(config)) return;
      const jobs = await query<AqsiJob>(`SELECT * FROM aqsi_jobs j WHERE state IN ('QUEUED','BLOCKED')
        AND NOT EXISTS (SELECT 1 FROM aqsi_jobs a WHERE a."deviceId"=j."deviceId" AND a.state IN ('PROCESSING','UNKNOWN','SUBMITTING'))
        ORDER BY CASE WHEN kind='RECEIPT' THEN 0 ELSE 1 END,"createdAt" LIMIT 10`);
      const sentDevices = new Set<number>();
      for (const job of jobs) {
        if (sentDevices.has(job.deviceId)) continue;
        if(job.kind==='CARD' && Date.now()-new Date(job.createdAt).getTime()>120_000) {
          await setJob(job,'FAILED','Время ожидания терминала истекло');
          await query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[job.orderId]);
          await settleOrderLoyalty(job.orderId,'CANCELLED');
          continue;
        }
        let payload = job.payload;
        if (job.kind === 'RECEIPT' && !payload) {
          try { payload = await buildReceipt(job); }
          catch { await setJob(job,'BLOCKED','Проверьте состав заказа и параметры чека'); continue; }
          if (!payload) { await setJob(job,'BLOCKED','Печать чеков выключена или не заполнены налоговые параметры'); continue; }
        }
        if (job.kind === 'RECEIPT' && !config.receiptsEnabled) continue;
        const order = await queryOne<{paymentStatus:string;status:string}>(`SELECT "paymentStatus",status FROM orders WHERE id=$1`,[job.orderId]);
        if (job.kind === 'CARD' && (order?.paymentStatus !== 'PENDING' || order.status === 'CANCELLED')) {
          await setJob(job,'FAILED','Заказ отменён до отправки'); continue;
        }
        await query(`UPDATE aqsi_jobs SET state='SUBMITTING',payload=$2,error=NULL,"submittedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1`,[job.id,JSON.stringify(payload)]);
        sentDevices.add(job.deviceId);
        try {
          const response = await aqsiRequest<{operationId:string}>(job.kind === 'CARD' ? '/v4/Slips/process/purchase' : '/v4/Receipts/process','POST',payload);
          if (!response?.operationId || !/^[0-9a-f-]{36}$/i.test(response.operationId)) throw new AqsiRequestError('Нет ID операции',true);
          await query(`UPDATE aqsi_jobs SET state='PROCESSING',"operationId"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,response.operationId]);
        } catch (error) {
          const ambiguous = !(error instanceof AqsiRequestError) || error.ambiguous;
          await setJob(job,ambiguous ? 'UNKNOWN' : 'FAILED',error instanceof AqsiRequestError ? error.message : 'Требуется проверить операцию');
          if (!ambiguous && job.kind === 'CARD') {
            await query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[job.orderId]);
            await settleOrderLoyalty(job.orderId,'CANCELLED');
          }
        }
      }
    } finally { await client.query('SELECT pg_advisory_unlock(784146,20)'); }
  } finally { client.release(); }
}

export async function aqsiOrderState(orderId: string) {
  const jobs = await query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE "orderId"=$1`,[orderId]);
  const card = jobs.find(job => job.kind === 'CARD');
  const receipt = jobs.find(job => job.kind === 'RECEIPT');
  return { terminalState:card?.state ?? null, receiptState:receipt?.state ?? null,
    terminalMessage:card?.state === 'UNKNOWN' ? 'Результат оплаты уточняется. Обратитесь к сотруднику; не оплачивайте повторно.' : null };
}

export async function retryAqsiReceipt(jobId: string): Promise<boolean> {
  return withTransaction(async client=>{
    // Serialize with the worker. Only a definitive failure may be resubmitted;
    // rebuild the receipt from the paid order and the current saved settings.
    await client.query('SELECT pg_advisory_xact_lock(784146,20)');
    const updated=await client.query(`UPDATE aqsi_jobs SET state='QUEUED',payload=NULL,result=NULL,
      "operationId"=NULL,"submittedAt"=NULL,error=NULL,"updatedAt"=NOW()
      WHERE id=$1 AND kind='RECEIPT' AND state='FAILED' RETURNING id`,[jobId]);
    return updated.rowCount===1;
  });
}

export async function cancelAqsiCard(orderId: string) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(784146,20)');
    const job = (await client.query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE "orderId"=$1 AND kind='CARD'`,[orderId])).rows[0];
    if (!job || ['FAILED','SUCCEEDED'].includes(job.state)) return;
    if (job.state === 'QUEUED') {
      await setJob(job,'FAILED','Отменено покупателем до отправки');
      await query(`UPDATE orders SET status='CANCELLED' WHERE id=$1 AND "paymentStatus"='PENDING'`,[orderId]);
      await settleOrderLoyalty(orderId,'CANCELLED');
    } else if (job.operationId) {
      await aqsiRequest(`/v4/Operations/${job.operationId}/cancel`,'POST');
      // Cancellation is a request, not proof of failure. Await final status.
    }
  } finally { try {await client.query('SELECT pg_advisory_unlock(784146,20)')} finally {client.release()} }
}
