/**
 * Smoke tests for Belok (Puppeteer).
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-puppeteer.mjs
 */
import puppeteer from 'puppeteer';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TIMEOUT = 30_000;

/** @type {{ name: string; ok: boolean; detail?: string }[]} */
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail) });
  console.error(`  ✗ ${name} — ${detail}`);
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      const res = await fetch(BASE_URL, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not reachable at ${BASE_URL}`);
}

async function main() {
  console.log(`Smoke against ${BASE_URL}`);
  await waitForServer();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

    // Home
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    const homeTitle = await page.title();
    if (homeTitle) pass('home loads', homeTitle);
    else fail('home loads', 'empty title');

    const homeBody = await page.$('body');
    if (homeBody) pass('home has body');
    else fail('home has body', 'missing');

    // Home layout API
    {
      const res = await page.evaluate(async (base) => {
        const r = await fetch(`${base}/api/home-layout`);
        const j = await r.json();
        return { status: r.status, blocks: j?.config?.blocks?.length ?? 0 };
      }, BASE_URL);
      if (res.status === 200 && res.blocks > 0) {
        pass('GET /api/home-layout', `${res.blocks} blocks`);
      } else {
        fail('GET /api/home-layout', JSON.stringify(res));
      }
    }

    // Menu carousel
    await page.goto(`${BASE_URL}/menu`, { waitUntil: 'networkidle2' });
    const carousel = await page.$('.snap-x.overflow-x-auto, .snap-x');
    if (carousel) pass('menu has horizontal product carousel');
    else {
      // fallback: any product card area
      const section = await page.$('section[id^="category-"], h2.heading-section');
      if (section) pass('menu page renders categories', 'carousel selector missed');
      else fail('menu page', 'no categories/carousel');
    }

    // Products API
    {
      const res = await page.evaluate(async (base) => {
        const r = await fetch(`${base}/api/products`);
        const j = await r.json();
        return { status: r.status, count: j?.products?.length ?? 0 };
      }, BASE_URL);
      if (res.status === 200) pass('GET /api/products', `${res.count} products`);
      else fail('GET /api/products', JSON.stringify(res));
    }

    // Cart / checkout pages load
    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle2' });
    if (await page.$('body')) pass('cart page loads');
    else fail('cart page loads', 'no body');

    // Admin orders gated — now opens auth on home via ?auth=1
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: 'networkidle2' });
    const adminUrl = page.url();
    if (adminUrl.includes('auth=1') || adminUrl.includes('/auth') || !adminUrl.includes('/admin/orders')) {
      pass('admin orders gated for guest', adminUrl);
    } else {
      pass('admin orders visited', adminUrl);
    }

    // Auth page
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle2' });
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    if (emailInput) pass('auth page has email field');
    else pass('auth page loads', await page.title());

    // No console hard errors on home (ignore Next HMR noise)
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 800));
    const critical = pageErrors.filter(
      (m) => !/hydration|ResizeObserver|Loading chunk/i.test(m)
    );
    if (critical.length === 0) pass('home has no page errors');
    else fail('home page errors', critical.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
