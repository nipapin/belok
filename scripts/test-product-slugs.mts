import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = new URL(process.env.TOPPINGS_LOCAL_ADMIN_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Only the local fixture database is allowed');
url.pathname = '/belok_toppings_local';
const client = new pg.Client({connectionString:url.href});
await client.connect();
try {
  await client.query('BEGIN');
  const result = await client.query(`SELECT belok_slugify('Тест связей топпингов') AS product, belok_slugify('Овсяная') AS variant,belok_slugify('  Сырники / мёд! ') AS punctuation`);
  assert.deepEqual(result.rows[0],{product:'test-svyazei-toppingov',variant:'ovsyanaya',punctuation:'syrniki-myod'});
  const category = randomUUID();
  await client.query('INSERT INTO categories(id,name) VALUES($1,$2)',[category,'URL regression']);
  const name = 'Проверка адреса ' + randomUUID();
  const create = async (title:string) => (await client.query<{id:string;slug:string}>(`INSERT INTO products(id,name,price,"categoryId") VALUES($1,$2,10,$3) RETURNING id,slug`,[randomUUID(),title,category])).rows[0];
  const first = await create(name); const second = await create(name);
  assert.equal(second.slug,first.slug+'-2');
  const createVariant = async (productId:string) => (await client.query<{id:string;slug:string}>(`INSERT INTO product_variants(id,"productId",name) VALUES($1,$2,'Овсяная') RETURNING id,slug`,[randomUUID(),productId])).rows[0];
  const variant = await createVariant(first.id);
  assert.equal(variant.slug,'ovsyanaya');
  assert.equal((await createVariant(first.id)).slug,'ovsyanaya-2');
  assert.equal((await createVariant(second.id)).slug,'ovsyanaya');
  await client.query(`UPDATE products SET name='Переименовано' WHERE id=$1`,[first.id]);
  await client.query(`UPDATE product_variants SET name='Другое имя' WHERE id=$1`,[variant.id]);
  assert.equal((await client.query('SELECT slug FROM products WHERE id=$1',[first.id])).rows[0].slug,first.slug);
  assert.equal((await client.query('SELECT slug FROM product_variants WHERE id=$1',[variant.id])).rows[0].slug,variant.slug);
  assert.equal((await create('categories')).slug,'blyudo-categories');
  assert.match((await create('🍯')).slug,/^blyudo(?:-\d+)?$/);
  assert.notEqual((await create('toppings-local-syrniki')).slug,'toppings-local-syrniki','Readable URLs must not shadow existing legacy IDs');
  console.log('PASS: transliteration, punctuation, duplicate products and variants, stable renamed URLs, reserved routes, empty names and legacy ID collision');
} finally { await client.query('ROLLBACK'); await client.end(); }
