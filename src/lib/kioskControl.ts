import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAppSetting, setAppSetting } from '@/lib/appSettings';
import { query } from '@/lib/db';

export interface KioskRefreshCommand { id:string;requestedAt:string }
export interface KioskClient { id:string;revision:string;busy:boolean;lastRefreshId:string|null;seenAt:string }
function latestCommand(commands:(KioskRefreshCommand|null)[]) {
  return commands.filter((c):c is KioskRefreshCommand=>Boolean(c))
    .sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt))[0] ?? null;
}
export function validKioskClientId(value:unknown):value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export async function kioskRefreshCommand(clientId:string) {
  const commands = await Promise.all([
    getAppSetting<KioskRefreshCommand>(`kiosk_refresh:${clientId}`),
    getAppSetting<KioskRefreshCommand>('kiosk_refresh'),
  ]);
  return latestCommand(commands);
}
export async function requestKioskRefresh(clientId?:string) {
  const command={id:randomUUID(),requestedAt:new Date().toISOString()};
  await setAppSetting(clientId ? `kiosk_refresh:${clientId}` : 'kiosk_refresh',command);
  return command;
}
export async function reportKioskClient(client:Omit<KioskClient,'seenAt'>) {
  await setAppSetting(`kiosk_client:${client.id}`,{...client,seenAt:new Date().toISOString()});
  return kioskRefreshCommand(client.id);
}
export async function listKioskClients() {
  const rows=await query<{value:KioskClient;globalCommand:KioskRefreshCommand|null;targetCommand:KioskRefreshCommand|null}>(`
    SELECT c.value,g.value AS "globalCommand",t.value AS "targetCommand" FROM app_settings c
    LEFT JOIN app_settings g ON g.key='kiosk_refresh'
    LEFT JOIN app_settings t ON t.key='kiosk_refresh:' || (c.value->>'id')
    WHERE c.key LIKE 'kiosk_client:%' ORDER BY c."updatedAt" DESC LIMIT 50`);
  const now=Date.now();
  return rows.map(row=>({...row.value,online:now-new Date(row.value.seenAt).getTime()<60_000,
    command:latestCommand([row.targetCommand,row.globalCommand])}));
}
