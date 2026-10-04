/** Production API + browser checks against an isolated local PostgreSQL database.
 * Build first, then run: node scripts/test-kitchen.mjs
 * Optional: TEST_DATABASE_ADMIN_URL=postgresql://...@localhost:5432/postgres
 * Never uses DATABASE_URL from .env for writes.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import puppeteer from 'puppeteer';

const root = process.cwd();
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://postgres:postgres@localhost:5432/postgres');
assert(['localhost','127.0.0.1','[::1]'].includes(adminUrl.hostname), 'Test database must be local');
const database = `belok_kitchen_test_${randomUUID().replaceAll('-','')}`;
assert(/^belok_kitchen_test_[a-f0-9]+$/.test(database));
const admin = new Client({ connectionString: adminUrl.toString() });
const testUrl = new URL(adminUrl); testUrl.pathname = `/${database}`;
const client = new Client({ connectionString: testUrl.toString() });
const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
assert(secret, 'Session secret is required');
const port = Number(process.env.KITCHEN_TEST_PORT || 3001);
const base = `http://localhost:${port}`;
let server, browser, created = false, connected = false, uploadPath;
const logs = [];
const report = name => console.log(`PASS ${name}`);
const cookieFor = id => `belok_session=${id}.${createHmac('sha256',secret).update(id).digest('hex')}`;
let cookie;

async function request(url, body, auth = true) {
  const headers = auth && cookie ? { Cookie: cookie } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'PUT', headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status:response.status, data:await response.json() };
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`); created = true;
  const env = { ...process.env, DATABASE_URL:testUrl.toString(), DATABASE_SSL:'false', NODE_ENV:'production',
    S3_ENDPOINT:'', S3_BUCKET:'', S3_ACCESS_KEY_ID:'', S3_SECRET_ACCESS_KEY:'', BLOB_READ_WRITE_TOKEN:'' };
  const migration = spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/migrate.ts'], { cwd:root,env,encoding:'utf8' });
  assert.equal(migration.status,0,migration.stderr);
  await client.connect(); connected = true;
  const adminId = randomUUID(), sessionId = randomUUID(), userId = randomUUID(), userSession = randomUUID();
  await client.query('INSERT INTO users (id,name,role) VALUES ($1,$2,$3),($4,$5,$6)',[adminId,'Kitchen test admin','ADMIN',userId,'Kitchen test user','USER']);
  await client.query('INSERT INTO sessions (id,"userId") VALUES ($1,$2),($3,$4)',[sessionId,adminId,userSession,userId]);
  cookie = cookieFor(sessionId);
  server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  for (const stream of [server.stdout,server.stderr]) stream.on('data',chunk => logs.push(chunk.toString()));
  let ready = false;
  for(let i=0;i<120;i++) {
    if(server.exitCode !== null) throw new Error(`Test server exited: ${logs.join('').slice(-3000)}`);
    try { if((await fetch(base+'/api/kitchen',{headers:{Cookie:cookie}})).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert(ready,'Test server did not start');
  const seeds = JSON.parse(await readFile(path.join(root,'src/data/kitchen-cards.json'),'utf8'));
  assert(seeds.find(c=>c.id==='belok-15').sourceText.includes('18 часов 78 градусов'));
  assert(seeds.find(c=>c.id==='belok-28').sourceText.includes('80 грамм'));
  assert.equal(seeds.filter(c=>c.sourceNumber==='30').length,4);
  const publicCards = await request('/api/kitchen');
  assert.equal(publicCards.status,200); assert.equal(publicCards.data.cards.length,seeds.filter(c=>c.published).length);
  assert(publicCards.data.cards.every(c=>c.sourceText === '' && c.published));
  const anonymousCards = await request('/api/kitchen',undefined,false);
  assert.equal(anonymousCards.status,403); assert.equal(anonymousCards.data.cards,undefined);
  const anonymousPage = await fetch(base+'/kitchen',{redirect:'manual'});
  assert.equal(anonymousPage.status,307);
  const loginRedirect = new URL(anonymousPage.headers.get('location'),base);
  assert.equal(loginRedirect.searchParams.get('auth'),'1');
  assert.equal(loginRedirect.searchParams.get('redirect'),'/kitchen');
  assert.equal((await request('/api/admin/kitchen',undefined,false)).status,403);
  const oldCookie=cookie; cookie=cookieFor(userSession);
  assert.equal((await request('/api/admin/kitchen')).status,403);
  const userCards = await request('/api/kitchen');
  assert.equal(userCards.status,403); assert.equal(userCards.data.cards,undefined);
  const userPage = await fetch(base+'/kitchen',{headers:{Cookie:cookie},redirect:'manual'});
  assert.equal(userPage.status,307); assert.equal(new URL(userPage.headers.get('location'),base).pathname,'/menu');
  cookie=cookieFor(randomUUID());
  assert.equal((await request('/api/kitchen')).status,403);
  cookie=oldCookie;
  assert.equal((await fetch(base+'/kitchen',{headers:{Cookie:cookie},redirect:'manual'})).status,200);
  assert.equal((await request('/api/admin/kitchen')).data.cards.length,33);
  const source=seeds.find(c=>c.id==='belok-1');
  assert.equal((await request('/api/admin/kitchen/belok-1',source,false)).status,403);
  assert.equal((await request('/api/admin/kitchen/belok-1',{...source,steps:[]})).status,400);
  assert.equal((await request('/api/admin/kitchen/belok-1',{...source,steps:[{...source.steps[0],imageUrl:'javascript:alert(1)'}]})).status,400);
  report('ADMIN-only page and API, anonymous/USER/invalid session denied, hidden drafts and validation');
  const edited={...source,title:'Тестовый томатный соус',sourceText:'do not replace source',steps:[...source.steps].reverse()};
  const first=await request('/api/admin/kitchen/belok-1',edited);
  assert.equal(first.status,200); assert.equal(first.data.card.version,2); assert.equal(first.data.card.sourceText,source.sourceText);
  assert.equal((await request('/api/admin/kitchen/belok-1',edited)).status,409);
  assert.equal((await request('/api/kitchen')).data.cards.find(c=>c.id===source.id).title,edited.title);
  const [raceA,raceB]=await Promise.all([request('/api/admin/kitchen/belok-1',first.data.card),request('/api/admin/kitchen/belok-1',first.data.card)]);
  assert.deepEqual([raceA.status,raceB.status].sort(),[200,409]);
  report('persistence, source preservation and concurrent edit conflict');
  const newCard={...source,id:randomUUID(),title:'Тестовая заготовка',sourceNumber:'',sourceText:'',version:0,published:false};
  const saved=await request(`/api/admin/kitchen/${newCard.id}`,newCard); assert.equal(saved.status,200);
  assert(!(await request('/api/kitchen')).data.cards.some(c=>c.id===newCard.id));
  const published=await request(`/api/admin/kitchen/${newCard.id}`,{...saved.data.card,published:true});
  assert.equal(published.status,200);
  assert((await request('/api/kitchen')).data.cards.some(c=>c.id===newCard.id));
  report('create draft and publish');

  // Restore seed within the disposable database for predictable browser assertions.
  await client.query('DELETE FROM app_settings WHERE starts_with(key,$1)',['kitchen.card.']);
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const deniedPage = await browser.newPage();
  await deniedPage.goto(base+'/kitchen',{waitUntil:'networkidle2'});
  assert.notEqual(new URL(deniedPage.url()).pathname,'/kitchen');
  assert.equal(await deniedPage.$('.kitchen-app'),null);
  await deniedPage.setCookie({name:'belok_session',value:cookieFor(userSession).split('=')[1],url:base,httpOnly:true,sameSite:'Lax'});
  await deniedPage.goto(base+'/kitchen',{waitUntil:'networkidle2'});
  assert.equal(new URL(deniedPage.url()).pathname,'/menu');
  assert.equal(await deniedPage.$('.kitchen-app'),null);
  await deniedPage.close();
  report('anonymous and USER browser access blocked before kitchen renders');
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.setCookie({name:'belok_session',value:cookie.split('=')[1],url:base,httpOnly:true,sameSite:'Lax'});
  await page.goto(base+'/kitchen',{waitUntil:'networkidle2'});
  await page.waitForSelector('.kitchen-recipe');
  assert.equal(await page.$$eval('.kitchen-recipe',nodes=>nodes.length),seeds.filter(c=>c.published).length);
  await page.type('input[aria-label="Найти техкарту"]','Соус Томатный');
  await page.waitForFunction(()=>document.querySelectorAll('.kitchen-recipe').length===1);
  await page.click('.kitchen-recipe');
  assert.equal(await page.$eval('.kitchen-step-title',e=>e.textContent),'Подготовьте ингредиенты');
  await page.click('.kitchen-actions .kitchen-button:last-child');
  assert.equal(await page.$$eval('.kitchen-single-step',nodes=>nodes.length),1);
  assert.equal(await page.$eval('.kitchen-step-label',e=>e.textContent),`Шаг 1 из ${source.steps.length}`);
  await page.click('.kitchen-actions .kitchen-button:last-child');
  const secondText=await page.$eval('.kitchen-step-text',e=>e.textContent);
  await page.reload({waitUntil:'networkidle2'}); await page.waitForSelector('.kitchen-recipe');
  await page.type('input[aria-label="Найти техкарту"]','Соус Томатный');
  await page.waitForFunction(()=>document.querySelectorAll('.kitchen-recipe').length===1); await page.click('.kitchen-recipe');
  assert.equal(await page.$eval('.kitchen-step-text',e=>e.textContent),secondText);
  await page.click('.kitchen-mode button:last-child'); assert.equal(await page.$$eval('.kitchen-full-steps li',nodes=>nodes.length),source.steps.length);
  await page.click('.kitchen-run-footer .kitchen-button');
  assert.equal(await page.$eval('.kitchen-step-text',e=>e.textContent),secondText);
  const dimensions=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(dimensions.body<=dimensions.viewport,'Mobile horizontal overflow');
  await mkdir(path.join(root,'output/kitchen-qa'),{recursive:true});
  await page.screenshot({path:path.join(root,'output/kitchen-qa/mobile-step.png')});
  for(let i=0;i<source.steps.length-1;i++) await page.click('.kitchen-actions .kitchen-button:last-child');
  assert(await page.$('.kitchen-complete'));
  await page.click('.kitchen-complete .kitchen-button'); assert(await page.$('.kitchen-ingredients'));
  report('mobile single-step flow, full card, resume, completion and restart');

  await page.setCookie({name:'belok_session',value:cookie.split('=')[1],url:base,httpOnly:true,sameSite:'Lax'});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.goto(base+'/admin/kitchen',{waitUntil:'networkidle2'});
  await page.waitForSelector('input[aria-label="Поиск карт в админке"]');
  await page.locator('nav button ::-p-text(Кухня · приготовление)').click();
  await page.waitForSelector('.kitchen-recipe');
  assert.equal(new URL(page.url()).pathname,'/kitchen');
  await page.click('.kitchen-admin');
  await page.waitForSelector('input[aria-label="Поиск карт в админке"]');
  report('kitchen opens from admin menu and links back to the editor');
  await page.type('input[aria-label="Поиск карт в админке"]','Соус Томатный');
  await page.locator('button ::-p-text(Соус Томатный)').click();
  await page.waitForSelector('fieldset');
  await page.$eval('fieldset input',input=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Соус для проверки кухни');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('button[aria-label="Переместить шаг 1 ниже"]');
  const file=await page.$('input[type=file]');
  const pngPath=path.join(root,'output/kitchen-qa/test-photo.png');
  await (await import('node:fs/promises')).writeFile(pngPath,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  await file.uploadFile(pngPath);
  await page.waitForSelector('fieldset img');
  const imageUrl=await page.$eval('fieldset img',img=>img.getAttribute('src'));
  uploadPath=path.join(root,'public',imageUrl);
  assert(imageUrl.startsWith('/uploads/'));
  assert(uploadPath.startsWith(path.join(root,'public','uploads')));
  const timer=await page.$('input[type=number]');await timer.click({clickCount:3});await timer.type('2');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Сохранить карту')).click());
  await page.waitForSelector('[role=status]');
  await page.screenshot({path:path.join(root,'output/kitchen-qa/admin-editor.png')});
  const stored=(await request('/api/admin/kitchen')).data.cards.find(c=>c.id===source.id);
  assert.equal(stored.steps[0].id,source.steps[1].id);assert.equal(stored.steps[0].imageUrl,imageUrl);assert.equal(stored.steps[0].timerSeconds,2);
  await page.goto(base+'/kitchen',{waitUntil:'networkidle2'});await page.waitForSelector('.kitchen-recipe');
  await page.type('input[aria-label="Найти техкарту"]','Соус для проверки кухни');
  await page.waitForFunction(()=>document.querySelectorAll('.kitchen-recipe').length===1);await page.click('.kitchen-recipe');
  // Changing a recipe revision clears the previous progress.
  assert(await page.$('.kitchen-ingredients'));await page.click('.kitchen-actions .kitchen-button:last-child');
  await page.waitForSelector('.kitchen-step-photo'); assert.equal(await page.$eval('.kitchen-step-photo',e=>e.naturalWidth),1);
  await page.click('.kitchen-timer button');
  await page.click('.kitchen-mode button:last-child'); await new Promise(r=>setTimeout(r,2200));
  await page.click('.kitchen-run-footer .kitchen-button');
  await page.waitForFunction(()=>document.querySelector('.kitchen-timer strong')?.textContent==='Время вышло');
  await page.screenshot({path:path.join(root,'output/kitchen-qa/desktop-step.png')});
  for(let i=0;i<stored.steps.length;i++) await page.click('.kitchen-actions .kitchen-button:last-child');
  await page.click('.kitchen-complete .kitchen-button');
  await page.click('.kitchen-actions .kitchen-button:last-child');
  assert.equal(await page.$eval('.kitchen-timer strong',e=>e.textContent),'0:02');
  assert.deepEqual(errors,[]);
  report('admin editor, ordering, photo upload, save, revision reset and persistent timer');
} finally {
  if(browser) await browser.close();
  if(server && server.exitCode === null) {
    if(process.platform==='win32') spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore'});
    else server.kill('SIGTERM');
  }
  if(uploadPath) await unlink(uploadPath).catch(()=>{});
  if(connected) await client.end();
  if(created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
}
