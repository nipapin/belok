import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/adminAuth';
import { query, queryOne } from '@/lib/db';
import { getAqsiConfig, fiscalConfigured } from '@/lib/aqsiConfig';
import { setAppSetting } from '@/lib/appSettings';
import { processAqsiJobs, retryAqsiReceipt, type AqsiJob } from '@/lib/aqsiJobs';
import { processAqsiCatalog } from '@/lib/aqsiCatalog';
import { aqsiRequest, type AqsiOperation } from '@/lib/aqsi';
import { processAqsiCashOrders } from '@/lib/aqsiCashOrders';

const schema=z.object({enabled:z.boolean(),deviceId:z.number().int().positive(),receiptsEnabled:z.boolean(),catalogEnabled:z.boolean(),
  cashOrdersEnabled:z.boolean().default(true),
  taxSystemCode:z.union([z.literal(1),z.literal(2),z.literal(4),z.literal(16),z.literal(32)]),
  taxRateId:z.number().int().min(1).max(10).nullable(),calculationTypeId:z.literal(4).nullable(),
  calculationSubjectId:z.literal(1),cashierName:z.string().max(64)});
function failure(error:unknown) {
  return NextResponse.json({error:(error as Error).message==='UNAUTHORIZED' ? 'Нет доступа' : 'Не удалось выполнить действие aQsi'},
    {status:(error as Error).message==='UNAUTHORIZED' ? 403 : 500});
}
export async function GET() {
  try {
    await requireAdmin();
    const [config,jobs,catalog]=await Promise.all([getAqsiConfig(),
      query(`SELECT j.*,o."dailyNumber" FROM (
        SELECT id,"orderId",kind,state,"operationId"::text,error,payload,"submittedAt","createdAt" FROM aqsi_jobs
        UNION ALL SELECT id,"orderId",'CASH_ORDER',state,"operationId",error,payload,"submittedAt","createdAt" FROM aqsi_cash_orders
      ) j LEFT JOIN orders o ON o.id=j."orderId" ORDER BY j."createdAt" DESC LIMIT 50`),
      queryOne(`SELECT revision,"syncedRevision",phase,"taskId",error,"updatedAt" FROM aqsi_catalog_sync WHERE id=1`)]);
    return NextResponse.json({config,keyConfigured:Boolean(process.env.AQSI_API_KEY?.trim()),jobs,catalog},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return failure(error)}
}
export async function PUT(request:NextRequest) {
  try {
    await requireAdmin();
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:'Проверьте настройки кассы'},{status:400});
    const config=parsed.data;
    if((config.receiptsEnabled || config.catalogEnabled || config.cashOrdersEnabled) && !fiscalConfigured(config)) return NextResponse.json({error:'Укажите НДС и полный расчёт. Чеки зачёта предоплаты пока не поддерживаются.'},{status:400});
    if(config.cashierName && !config.cashierName.trim().includes(' ')) return NextResponse.json({error:'Укажите должность и фамилию кассира через пробел'},{status:400});
    const before=await getAqsiConfig();
    if(config.deviceId!==before.deviceId) {
      const pending=await queryOne(`SELECT id FROM aqsi_jobs WHERE state NOT IN ('SUCCEEDED','FAILED') LIMIT 1`);
      if(pending) return NextResponse.json({error:'Сначала завершите операции на текущей кассе'},{status:409});
      if(await queryOne(`SELECT id FROM aqsi_cash_orders WHERE state NOT IN ('SUCCEEDED','CANCELLED','FAILED') LIMIT 1`)) return NextResponse.json({error:'Сначала завершите наличные заказы на текущей кассе'},{status:409});
    }
    await setAppSetting('aqsi',config);
    await query(`UPDATE aqsi_catalog_sync SET revision=revision+1 WHERE id=1`);
    after(async()=>{await processAqsiJobs();await processAqsiCashOrders();await processAqsiCatalog()});
    return NextResponse.json({config});
  } catch(error) {return failure(error)}
}
export async function POST(request:NextRequest) {
  try {
    await requireAdmin();
    const body=await request.json();
    if(body.action==='sync') {
      await query(`UPDATE aqsi_catalog_sync SET revision=revision+1 WHERE id=1`);
    } else if(body.action==='retryReceipt') {
      // Only definitive failures can be retried. UNKNOWN cannot be resubmitted.
      if(typeof body.jobId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return NextResponse.json({error:'Некорректный ID чека'},{status:400});
      if(!await retryAqsiReceipt(body.jobId)) return NextResponse.json({error:'Повторно отправить можно только чек с подтверждённой ошибкой'},{status:409});
    } else if(body.action==='reconcile' && typeof body.operationId==='string' && /^[0-9a-f-]{36}$/i.test(body.operationId)) {
      const job=await queryOne<AqsiJob>('SELECT * FROM aqsi_jobs WHERE id=$1 AND state=\'UNKNOWN\'',[body.jobId]);
      if(!job) return NextResponse.json({error:'Операция не требует сверки'},{status:409});
      const operation=await aqsiRequest<AqsiOperation & {createdAt:string}>(`/v4/Operations/${body.operationId}`);
      if(operation.deviceId!==job.deviceId || operation.type!==(job.kind==='CARD' ? 'acquiring.purchase' : 'receipt.process') ||
        new Date(operation.createdAt).getTime()<new Date(job.createdAt).getTime()-5000) return NextResponse.json({error:'Эта операция не соответствует заказу'},{status:400});
      await query(`UPDATE aqsi_jobs SET state='PROCESSING',"operationId"=$2,error=NULL,"updatedAt"=NOW() WHERE id=$1 AND state='UNKNOWN'`,[job.id,operation.operationId]);
    } else if(body.action!=='process') return NextResponse.json({error:'Неизвестное действие'},{status:400});
    after(async()=>{await processAqsiJobs();await processAqsiCashOrders();await processAqsiCatalog()});
    return NextResponse.json({ok:true});
  } catch(error) {return failure(error)}
}
