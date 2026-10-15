// Dedicated localhost-only sandbox. Never reads or changes a production database.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const database = 'belok_toppings_local';
const url = new URL(process.env.TOPPINGS_LOCAL_ADMIN_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Local PostgreSQL only');
url.pathname = '/postgres';
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query(`CREATE DATABASE ${database}`);
} finally { await admin.end(); }
url.pathname = '/' + database;
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS _migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT NOW())');
  const applied = new Set((await client.query('SELECT name FROM _migrations')).rows.map((row) => row.name));
  const priority = (name) => name.startsWith('zz_') ? name === 'zz_inventory_mvp.sql' ? 1 : name === 'zz_inventory_recipes.sql' ? 2 : 3 : 0;
  const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort((a,b) => priority(a)-priority(b) || a.localeCompare(b));
  for (const file of migrations) {
    if (applied.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'));
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  const passwordHash = await bcrypt.hash('BelokLocal2026!', 10);
  await client.query(`INSERT INTO users(id,email,name,role,"emailVerifiedAt","passwordHash") VALUES('toppings-local-admin','admin@belok.local','Локальная проверка','ADMIN',NOW(),$1) ON CONFLICT(id) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash"`, [passwordHash]);
  await client.query(`INSERT INTO sessions(id,"userId") VALUES('toppings-local-session','toppings-local-admin') ON CONFLICT(id) DO UPDATE SET "revokedAt"=NULL,"lastSeenAt"=NOW()`);
  await client.query(`INSERT INTO categories(id,name,"sortOrder") VALUES('toppings-local-breakfast','Завтраки',0),('toppings-local-category','Топпинги',1) ON CONFLICT(id) DO NOTHING`);
  for (const [id, name, price, categoryId, isAvailable] of [
    ['toppings-local-syrniki','Сырники',290,'toppings-local-breakfast',true],
    ['toppings-local-porridge','Каша',180,'toppings-local-breakfast',true],
    ['toppings-local-sourcream','Сметана',40,'toppings-local-category',true],
    ['toppings-local-jam','Джем',50,'toppings-local-category',true],
    ['toppings-local-honey','Мёд',35,'toppings-local-category',true],
    ['toppings-local-stopped','Шоколад',60,'toppings-local-category',false],
  ]) await client.query(`INSERT INTO products(id,name,price,"categoryId","isAvailable",description) VALUES($1,$2,$3,$4,$5,'Тестовый товар для локальной проверки') ON CONFLICT(id) DO NOTHING`, [id,name,price,categoryId,isAvailable]);
  for (const [order, toppingId] of ['toppings-local-sourcream','toppings-local-jam','toppings-local-honey','toppings-local-stopped'].entries()) await client.query(`INSERT INTO product_toppings("productId","toppingId","sortOrder") VALUES('toppings-local-syrniki',$1,$2) ON CONFLICT DO NOTHING`, [toppingId,order]);
  console.log('Local database ready: belok_toppings_local. Test dish: Сырники; toppings: Сметана, Джем, Мёд.');
} finally { await client.end(); }
