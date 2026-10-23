import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, query, queryOne, withTransaction } from '@/lib/db';
import { aqsiRequest, AqsiRequestError, type AqsiOperation } from '@/lib/aqsi';
import { aqsiConfigured, fiscalConfigured, getAqsiConfig } from '@/lib/aqsiConfig';
import { receiptPositions, receiptOrderReference, parsePurchaseResult, parseReceiptResult, type FiscalItem } from '@/lib/aqsiReceipt';
import { notifyKitchenNewOrder } from '@/lib/orderNotify';
import { settleOrderLoyalty } from '@/lib/orderLoyalty';
import { enqueueCashOrder } from '@/lib/aqsiCashOrders';

export interface AqsiJob {
  id: string; orderId: string; deviceId: number; kind: 'CARD' | 'RECEIPT';
  state: 'QUEUED' | 'SUBMITTING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'BLOCKED';
  payload: Record<string, unknown> | null; operationId: string | null;
  result: Record<string, unknown> | null; error: string | null; createdAt: Date;
  cancelIntent: 'CANCEL' | 'DEFER' | null;
  submittedAt: Date | null;
  updatedAt: Date;
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
      additionalUserAttribute:{name:'Заказ',value:`#${order.dailyNumber}`},
      ...(order.email ? {customerInfo:{emailOrPhone:order.email}} : {}),
      ...(config.cashierName ? {cashierInfo:{positionAndSurname:config.cashierName}} : {})},
    positions,payments:[{type:1,amount:Math.round(order.total*100),...(card?.result ? {slip:card.result} : {})}],
  };
}

async function setJob(job: AqsiJob, state: AqsiJob['state'], error: string | null = null) {
  await query(`UPDATE aqsi_jobs SET state=$2,error=$3,"updatedAt"=NOW() WHERE id=$1`,[job.id,state,error]);
}

async function failCard(job: AqsiJob, error: string, cancellationRequested = false) {
  let cancelled = false;
  await withTransaction(async client => {
    const order = (await client.query<{paymentStatus:string;status:string}>(
      `SELECT "paymentStatus",status FROM orders WHERE id=$1 FOR UPDATE`, [job.orderId]
    )).rows[0];
    await client.query(`UPDATE aqsi_jobs SET state='FAILED',error=$2,"updatedAt"=NOW() WHERE id=$1`, [job.id,error]);
    if (!order || order.paymentStatus !== 'PENDING') return;
    // Do not create a second payable item at the till by default.
    // Cash fallback is allowed only after an explicit DEFER intent AND a
    // definitive aQsi no-charge result. Otherwise cancel the kiosk order.
    if (job.cancelIntent === 'DEFER' && order.status !== 'CANCELLED') {
      await enqueueCashOrder(client,job.orderId,job.deviceId);
    } else {
      await client.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [job.orderId]);
      cancelled = true;
    }
  });
  if (cancelled) await settleOrderLoyalty(job.orderId,'CANCELLED');
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
    const details=[operation.problems,operation.message].filter(Boolean).join(': ').slice(0,300);
    const error = `aQsi: ${operation.status}${details ? ` (${details})` : ''}`;
    // A terminal timeout or an error is not proof that the bank did not debit the
    // card. Only a final Canceled response without a result clears a card charge.
    if (job.kind === 'CARD') {
      if (operation.status === 'Canceled' && !operation.result) {
        await failCard(job,error,operation.isCancellationRequested);
      } else {
        await setJob(job,'UNKNOWN',`${error}. Проверьте списание в aQsi; повторная оплата запрещена.`);
      }
    } else if (operation.result) {
      await setJob(job,'UNKNOWN','Результат чека требует проверки в aQsi');
    } else await setJob(job,'FAILED',error);
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
      const failures=await query<AqsiJob>(`SELECT j.* FROM aqsi_jobs j JOIN orders o ON o.id=j."orderId"
        WHERE j.kind='CARD' AND j.state='FAILED' AND o."paymentStatus"='PENDING'
        AND NOT EXISTS (SELECT 1 FROM aqsi_cash_orders c WHERE c."orderId"=j."orderId") LIMIT 20`);
      for(const job of failures) {
        await failCard(job,job.error ?? 'Оплата картой не завершилась');
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
          await failCard(job,'Время ожидания терминала истекло');
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
          await failCard(job,'Заказ отменён до отправки'); continue;
        }
        await query(`UPDATE aqsi_jobs SET state='SUBMITTING',payload=$2,error=NULL,"submittedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1`,[job.id,JSON.stringify(payload)]);
        sentDevices.add(job.deviceId);
        try {
          const response = await aqsiRequest<{operationId:string}>(job.kind === 'CARD' ? '/v4/Slips/process/purchase' : '/v4/Receipts/process','POST',payload);
          if (!response?.operationId || !/^[0-9a-f-]{36}$/i.test(response.operationId)) throw new AqsiRequestError('Нет ID операции',true);
          await query(`UPDATE aqsi_jobs SET state='PROCESSING',"operationId"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,response.operationId]);
        } catch (error) {
          const ambiguous = !(error instanceof AqsiRequestError) || error.ambiguous;
          const message = error instanceof AqsiRequestError ? error.message : 'Требуется проверить операцию';
          if (!ambiguous && job.kind === 'CARD') {
            await failCard(job,message);
          } else await setJob(job,ambiguous ? 'UNKNOWN' : 'FAILED',message);
        }
      }
    } finally { await client.query('SELECT pg_advisory_unlock(784146,20)'); }
  } finally { client.release(); }
}

export async function aqsiOrderState(orderId: string) {
  const jobs = await query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE "orderId"=$1`,[orderId]);
  const card = jobs.find(job => job.kind === 'CARD');
  const receipt = jobs.find(job => job.kind === 'RECEIPT');
  const deferred = await queryOne<{state:string}>(`SELECT state FROM aqsi_cash_orders WHERE "orderId"=$1`,[orderId]);
  return { terminalState:card?.state ?? null, deferredState:deferred?.state ?? null, cancelIntent:card?.cancelIntent ?? null,
    terminalStartedAt:card?.createdAt ?? null, cancelRequestedAt:card?.cancelIntent ? card.updatedAt : null,
    receiptState:deferred?.state === 'SUCCEEDED' ? 'SUCCEEDED' : receipt?.state ?? null,
    terminalMessage:card?.state === 'UNKNOWN' ? 'Результат оплаты неизвестен. Нужна сверка сотрудником в aQsi; не оплачивайте повторно.' : null };
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

export async function cancelAqsiCard(orderId: string, intent: 'CANCEL' | 'DEFER' = 'CANCEL') {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(784146,20)');
    const job = (await client.query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE "orderId"=$1 AND kind='CARD'`,[orderId])).rows[0];
    if (!job || ['FAILED','SUCCEEDED','UNKNOWN'].includes(job.state)) return;
    if (await queryOne(`SELECT id FROM aqsi_cash_orders WHERE "orderId"=$1`,[orderId])) return;
    // Do not resend a cancellation POST when the first reply was lost.
    if (job.cancelIntent) return;
    await query(`UPDATE aqsi_jobs SET "cancelIntent"=$2,"updatedAt"=NOW() WHERE id=$1`,[job.id,intent]);
    job.cancelIntent = intent;
    if (job.state === 'QUEUED' || job.state === 'BLOCKED') {
      await failCard(job,intent === 'DEFER' ? 'Передано для оплаты на кассе до отправки' : 'Отменено покупателем до отправки');
    } else if (job.operationId) {
      await aqsiRequest(`/v4/Operations/${job.operationId}/cancel`,'POST');
      // Cancellation is a request, not proof of failure. Await final status.
    }
  } finally { try {await client.query('SELECT pg_advisory_unlock(784146,20)')} finally {client.release()} }
}


/**
 * Staff-only reconciliation after checking the transaction history in aQsi.
 * This never sends a purchase, refund, cancel or receipt POST. The original
 * kiosk order is voided, not turned into another payable cash order.
 */
export async function reconcileAqsiCardNoCharge(
  jobId: string, actorId: string, evidence: string, cashPaidElsewhere: boolean
) {
  const note = evidence.trim();
  if (note.length < 12 || note.length > 500) throw new Error('Опишите проверку в aQsi (12–500 символов)');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(784146,20)');
    const job = (await client.query<AqsiJob>(
      `SELECT * FROM aqsi_jobs WHERE id=$1 AND kind='CARD'`,[jobId]
    )).rows[0];
    if (!job || !['UNKNOWN','PROCESSING'].includes(job.state)) throw new Error('Карточная операция уже завершена или не требует сверки');
    let providerStatus = 'NO_OPERATION_ID';
    if (job.operationId) {
      // GET is read-only. A still-active payment, any result, or a mismatch
      // must block staff closure until it is resolved at the terminal/bank.
      const operation = await aqsiRequest<AqsiOperation>(`/v4/Operations/${job.operationId}`);
      if (operation.operationId !== job.operationId || operation.deviceId !== job.deviceId ||
        operation.type !== 'acquiring.purchase') throw new Error('Операция aQsi не соответствует заказу');
      if (!['Canceled','Timeout','Error'].includes(operation.status) || operation.result) {
        throw new Error('aQsi не подтвердил окончание операции без результата. Сначала проверьте её на терминале');
      }
      providerStatus = operation.status;
    }
    await client.query('BEGIN');
    try {
      const order = (await client.query<{paymentStatus:string;status:string}>(
        `SELECT "paymentStatus",status FROM orders WHERE id=$1 FOR UPDATE`,[job.orderId]
      )).rows[0];
      const current = (await client.query<AqsiJob>(`SELECT * FROM aqsi_jobs WHERE id=$1 FOR UPDATE`,[job.id])).rows[0];
      if (!order || order.paymentStatus !== 'PENDING' || order.status === 'COMPLETED' ||
        !current || !['UNKNOWN','PROCESSING'].includes(current.state)) {
        throw new Error('Статус заказа изменился. Обновите данные перед сверкой');
      }
      if ((await client.query(`SELECT id FROM aqsi_cash_orders WHERE "orderId"=$1`,[job.orderId])).rowCount) {
        throw new Error('В aQsi уже есть отложенный заказ. Сверьте его отдельно');
      }
      await client.query(`INSERT INTO aqsi_card_reconciliations
        ("jobId","orderId","actorId",evidence,"cashPaidElsewhere","providerStatus")
        VALUES ($1,$2,$3,$4,$5,$6)`,[job.id,job.orderId,actorId,note,cashPaidElsewhere,providerStatus]);
      await client.query(`UPDATE aqsi_jobs SET state='FAILED',error='Вручную сверено: списание не обнаружено',
        "updatedAt"=NOW() WHERE id=$1`,[job.id]);
      await client.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`,[job.orderId]);
      await client.query('COMMIT');
    } catch (error) {await client.query('ROLLBACK');throw error}
    // Release loyalty reservations exactly once. This does not record another
    // paid sale or enqueue a deferred order.
    await settleOrderLoyalty(job.orderId,'CANCELLED');
    return {orderId:job.orderId,providerStatus};
  } finally {
    try {await client.query('SELECT pg_advisory_unlock(784146,20)')}
    finally {client.release()}
  }
}
