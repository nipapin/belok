// Run once with the existing production environment, before switching the release.
// Only these additive migrations are applied; no local fixtures or catalog edits.
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

process.umask(0o077);
const connection = new URL(process.env.DATABASE_URL);
const backupDir = '/root/belok-backups/products-' + new Date().toISOString().replace(/[:.]/g,'-');
await mkdir(backupDir,{recursive:true,mode:0o700});
const backup = backupDir + '/belok.dump';
const pgEnv = { ...process.env, PGHOST:connection.hostname, PGPORT:connection.port || '5432', PGUSER:decodeURIComponent(connection.username), PGPASSWORD:decodeURIComponent(connection.password), PGDATABASE:decodeURIComponent(connection.pathname.slice(1)), PGCONNECT_TIMEOUT:'15' };
if (process.env.DATABASE_SSL === 'true') pgEnv.PGSSLMODE = 'require';
else if (connection.searchParams.get('sslmode')) pgEnv.PGSSLMODE = connection.searchParams.get('sslmode');
const dump = spawnSync('pg_dump',['--format=custom','--no-owner','--no-acl','--file='+backup],{env:pgEnv,encoding:'utf8',timeout:300_000});
if (dump.status !== 0) throw new Error('Production backup failed; migrations were not started');
const size = (await stat(backup)).size;
if (!size || spawnSync('pg_restore',['--list',backup],{encoding:'utf8'}).status !== 0) throw new Error('Backup verification failed; migrations were not started');

const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized:false} : undefined});
const client = await pool.connect();
try {
  const counts = async () => (await client.query(`SELECT (SELECT COUNT(*)::int FROM products) AS products,(SELECT COUNT(*)::int FROM product_variants) AS variants,(SELECT COUNT(*)::int FROM orders) AS orders,(SELECT COUNT(*)::int FROM order_items) AS items`)).rows[0];
  const before = await counts();
  await writeFile(backupDir+'/before.json',JSON.stringify(before));
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('belok-product-toppings-migrations'))");
  for (const file of ['026_product_toppings.sql','027_order_item_toppings.sql','028_product_slugs.sql']) {
    if ((await client.query('SELECT name FROM _migrations WHERE name=$1',[file])).rowCount) continue;
    await client.query(await readFile(new URL('./'+file,import.meta.url),'utf8'));
    await client.query('INSERT INTO _migrations(name) VALUES($1)',[file]);
  }
  await client.query('COMMIT');
  const after = await counts();
  const slugs = (await client.query(`SELECT COUNT(*) FILTER(WHERE slug IS NULL OR slug='')::int AS missing FROM products`)).rows[0];
  console.log(JSON.stringify({backup,bytes:size,before,after,missingSlugs:slugs.missing,migrations:'026–028 ready'}));
} catch (error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Product migration failed:',String(error.code ?? 'ERROR'));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
