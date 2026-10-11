import 'server-only';
import { paymentsDisabled } from '@/lib/paymentMode';
import { processAqsiJobs } from '@/lib/aqsiJobs';
import { processAqsiCatalog } from '@/lib/aqsiCatalog';
import { processAqsiCashOrders } from '@/lib/aqsiCashOrders';

declare global { var __aqsiWorkerStarted:boolean|undefined; }
export function startAqsiWorker() {
  if (paymentsDisabled()) return;
  if(globalThis.__aqsiWorkerStarted) return;
  globalThis.__aqsiWorkerStarted=true;
  async function tick() {
    if (paymentsDisabled()) return;
    try {await processAqsiJobs();await processAqsiCashOrders();await processAqsiCatalog()}
    catch {console.error('aQsi: worker tick failed; jobs remain in database')}
    setTimeout(tick,2000).unref();
  }
  setTimeout(tick,2000).unref();
}
