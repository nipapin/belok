import 'dotenv/config';
import { processAqsiJobs } from '../src/lib/aqsiJobs';
import { processAqsiCatalog } from '../src/lib/aqsiCatalog';
import { pool } from '../src/lib/db';
import { processAqsiCashOrders } from '../src/lib/aqsiCashOrders';

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
async function main() {
  while (!stopping) {
    try { await processAqsiJobs(); await processAqsiCashOrders(); await processAqsiCatalog(); }
    catch { console.error('aQsi worker: tick failed; pending jobs retained'); }
    if (process.argv.includes('--once')) break;
    await new Promise(resolve => setTimeout(resolve,2000));
  }
  await pool.end();
}
main().catch(() => { console.error('aQsi worker stopped'); process.exitCode=1; });
