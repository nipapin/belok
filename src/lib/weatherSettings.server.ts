import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { queryOne, query } from './db';

function encryptionKey() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw Error('Не настроен серверный секрет');
  return createHash('sha256').update(`belok-weather:${secret}`).digest();
}
export function sealWeatherKey(apiKey: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64')).join('.');
}
export function unsealWeatherKey(value: string) {
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
export async function weatherApiKey() {
  const row = await queryOne<{ value: { encryptedKey?: string } }>('SELECT value FROM app_settings WHERE key=$1', ['weather_openweather']);
  return row?.value?.encryptedKey ? unsealWeatherKey(row.value.encryptedKey) : process.env.OPENWEATHER_API_KEY?.trim() || null;
}
export async function saveWeatherApiKey(apiKey: string) {
  await query(`INSERT INTO app_settings(key,value,"updatedAt") VALUES($1,$2,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()`, ['weather_openweather', JSON.stringify({ encryptedKey: sealWeatherKey(apiKey) })]);
  await query('DELETE FROM weather_cache');
}
