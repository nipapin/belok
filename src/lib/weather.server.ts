import { pool, query, queryOne, withTransaction } from './db';
import type { PoolClient } from 'pg';
import { cafeDay } from './adminDashboard';
import { revenueDays } from './revenueStats';
import { parseOpenWeather, summarizeWeather, type WeatherHour, type WeatherSource } from './weather';
import { weatherApiKey, markWeatherConnected, weatherConnectionState } from './weatherSettings.server';

export class WeatherAccessError extends Error {
  constructor() { super('OpenWeather ещё не разрешил доступ: новый ключ может активироваться до двух часов. Проверьте One Call 4.0 и ключ, если ожидание затянется.'); }
}

export async function firstOrderDay() {
  // Existing order timestamps are stored as UTC without a PostgreSQL timezone.
  const row = await queryOne<{ day: string | null }>(`SELECT to_char(min("createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kaliningrad', 'YYYY-MM-DD') AS day FROM orders`);
  return row?.day ?? null;
}

async function reserveCall(connection: Pick<PoolClient, 'query'>) {
  const result = await connection.query(`INSERT INTO weather_api_usage(day,calls) VALUES ((now() AT TIME ZONE 'UTC')::date,1)
    ON CONFLICT(day) DO UPDATE SET calls=weather_api_usage.calls+1 WHERE weather_api_usage.calls<900 RETURNING calls`);
  if (!result.rows.length) throw Error('Достигнут дневной лимит погоды. Продолжим завтра.');
}

export async function requestWeatherDay(day: string, apiKey: string, source: WeatherSource, connection: Pick<PoolClient, 'query'> = pool): Promise<WeatherHour[]> {
  await reserveCall(connection);
  const params = new URLSearchParams({ lat: '54.71', lon: '20.51', appid: apiKey, units: 'metric', lang: 'ru',
    start: String(Date.parse(`${day}T08:00:00+02:00`) / 1000), cnt: '13' });
  let response: Response;
  try {
    response = await fetch(`https://api.openweathermap.org/data/4.0/onecall/timeline/1h?${params}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  } catch { throw Error('OpenWeather временно недоступен'); }
  if (response.status === 401 || response.status === 403) throw new WeatherAccessError();
  if (response.status === 429) throw Error('Лимит OpenWeather исчерпан. Продолжим завтра.');
  if (!response.ok) throw Error(`OpenWeather: ошибка ${response.status}`);
  const payload: unknown = await response.json();
  const start = Date.parse(`${day}T08:00:00+02:00`); const end = start + 13 * 3_600_000;
  const rows = parseOpenWeather(payload, source).filter(row => Date.parse(row.time) >= start && Date.parse(row.time) < end);
  if (new Set(rows.map(row => row.time)).size !== 13) throw Error('OpenWeather пока не вернул все рабочие часы этого дня');
  return rows;
}

export async function syncWeatherDay(day: string, source: WeatherSource, apiKey: string) {
  const outcome = await withTransaction(async client => {
    const key = `${source}:${day}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`belok-weather:${key}`]);
    const cached = await client.query<{ expires_at: Date }>('SELECT expires_at FROM weather_cache WHERE key=$1', [key]);
    if (cached.rows[0]?.expires_at.getTime() > Date.now()) return;
    const count = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM weather_hours WHERE source=$1 AND time >= $2::timestamptz AND time < $2::timestamptz + interval '13 hours'`, [source, `${day}T08:00:00+02:00`]);
    if (source === 'archive' && count.rows[0].count === 13) return;
    try {
      const hours = await requestWeatherDay(day, apiKey, source, client);
      await client.query(`INSERT INTO weather_hours (time,source,temperature,precipitation,condition)
        SELECT time::timestamptz,source,temperature,precipitation,condition
        FROM jsonb_to_recordset($1::jsonb) AS x(time text,source text,temperature float8,precipitation float8,condition text)
        ON CONFLICT(time,source) DO UPDATE SET temperature=EXCLUDED.temperature,precipitation=EXCLUDED.precipitation,
          condition=EXCLUDED.condition,updated_at=now()`, [JSON.stringify(hours)]);
      await client.query(`INSERT INTO weather_cache(key,expires_at) VALUES($1,now()+interval '1 hour')
        ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at`, [key]);
      return 'saved';
    } catch (error) {
      await client.query(`INSERT INTO weather_cache(key,expires_at) VALUES($1,now()+interval '15 minutes')
        ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at`, [key]);
      return error;
    }
  });
  if (outcome === 'saved' && source === 'forecast') await markWeatherConnected();
  else if (outcome && outcome !== 'saved') throw outcome;
}

export async function syncForecast() {
  const key = await weatherApiKey(); if (!key) return false;
  const today = cafeDay(new Date());
  await syncWeatherDay(today, 'forecast', key);
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await syncWeatherDay(tomorrow.toISOString().slice(0, 10), 'forecast', key);
  return true;
}
export async function syncArchive(from: string, to: string) {
  const key = await weatherApiKey(); if (!key) return false;
  if ((await weatherConnectionState()).pending) return false;
  const pending = revenueDays(from, to).filter(day => day < cafeDay(new Date())).reverse();
  for (const day of pending) await syncWeatherDay(day, 'archive', key);
  return true;
}
export async function readWeather(from: string, to: string) {
  const rows = await query<WeatherHour>(`SELECT time,source,temperature,precipitation,condition FROM weather_hours
    WHERE time >= $1::date AND time < $2::date + interval '1 day' ORDER BY time`, [from, to]);
  return summarizeWeather(rows.map(row => ({ ...row, time: new Date(row.time).toISOString() })), from, to);
}
