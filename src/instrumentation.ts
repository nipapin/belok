export async function register() {
  if (process.env.NEXT_RUNTIME==='nodejs' && process.env.AQSI_WORKER_ENABLED==='true' && process.env.NEXT_PHASE!=='phase-production-build') {
    const {startAqsiWorker}=await import('@/lib/aqsiWorker');
    startAqsiWorker();
  }
}
