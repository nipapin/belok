export async function register() {
  // FirstVDS checks a candidate before switching production. A migration failure
  // must fail that check rather than activate a release without its indexes.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production'
      && process.env.NEXT_PHASE !== 'phase-production-build'
      && /^[a-f0-9]{40}-\d+-\d+$/.test(process.env.RELEASE_ID ?? '')) {
    const { applyOrderBoardIndexes } = await import('@/lib/orderBoardMigration');
    await applyOrderBoardIndexes();
  }
  if (process.env.NEXT_RUNTIME==='nodejs' && process.env.AQSI_WORKER_ENABLED==='true' && process.env.NEXT_PHASE!=='phase-production-build') {
    const {startAqsiWorker}=await import('@/lib/aqsiWorker');
    startAqsiWorker();
  }
}
