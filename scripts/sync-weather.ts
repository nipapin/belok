import 'dotenv/config';
import { pool } from '../src/lib/db';
import { cafeDay } from '../src/lib/adminDashboard';
import { firstOrderDay, syncArchive, syncForecast } from '../src/lib/weather.server';

try {
  const from = await firstOrderDay();
  // A temporary forecast failure must not stop archive recovery.
  let failed = false;
  try { if (!await syncForecast()) { console.log('Waiting for OpenWeather key'); } else console.log('Forecast saved'); } catch (error) { failed = true; console.error((error as Error).message); }
  if (from) {
    try { if (await syncArchive(from, cafeDay(new Date()))) console.log(`Archive recovered from ${from}`); }
    catch (error) { failed = true; console.error((error as Error).message); }
  }
  if (failed) process.exitCode = 1;
} finally { await pool.end(); }
