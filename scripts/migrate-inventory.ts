import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
const files = ["zz_inventory_mvp.sql","zz_inventory_images.sql","zz_inventory_recipes.sql","zz_inventory_product_links.sql","zz_inventory_recipe_instructions.sql","zz_inventory_stock_operations.sql","zz_inventory_unspecified_kind.sql","zz_inventory_audit_access.sql"];
async function main() {
 if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query(`SELECT pg_advisory_xact_lock(610112026)`);
  await client.query(`CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const applied=new Set((await client.query<{name:string}>('SELECT name FROM _migrations')).rows.map(r=>r.name));
  for(const name of files){if(applied.has(name))continue;await client.query(readFileSync(resolve('migrations',name),'utf8'));await client.query('INSERT INTO _migrations(name) VALUES($1)',[name]);console.log('Applied:',name);}
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
