'use strict';
const {readdirSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const {Pool}=require('pg');
(async()=>{
 const connectionString=process.env.DATABASE_URL;
 if(!connectionString)throw Error('DATABASE_URL missing for dev migrations');
 const pool=new Pool({connectionString,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined,max:1});
 const client=await pool.connect();
 try{
  await client.query('SELECT pg_advisory_lock($1)',[38422619]);
  await client.query('CREATE TABLE IF NOT EXISTS "_migrations" ("name" TEXT PRIMARY KEY,"applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const rows=await client.query('SELECT name FROM "_migrations"');
  const applied=new Set(rows.rows.map(r=>r.name));
  const files=readdirSync(join(__dirname,'migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files){
   if(applied.has(file))continue;
   const sql=readFileSync(join(__dirname,'migrations',file),'utf8');
   console.log('Applying migration:',file);
   await client.query('BEGIN');
   try{
    await client.query(sql);
    await client.query('INSERT INTO "_migrations" (name) VALUES ($1)',[file]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}
  }
  console.log('Dev migrations completed');
 }finally{
  try{await client.query('SELECT pg_advisory_unlock($1)',[38422619]);}catch{}
  client.release();await pool.end();
 }
})().catch(err=>{console.error('Dev migration failed:',err.message);process.exitCode=1});
