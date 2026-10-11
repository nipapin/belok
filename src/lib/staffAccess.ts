import { getAppSetting } from './appSettings';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { StaffRole } from './roles';

export const staffRolesKey = (id: string) => `employee_roles:${id}`;
export async function loadStaffRoles(id: string): Promise<StaffRole[] | null> {
  const assignment = await getAppSetting<{ roles: StaffRole[] }>(staffRolesKey(id));
  return assignment?.roles ?? null;
}
/** Stored in the existing JSONB settings table: no schema change or account backfill. */
export async function writeStaffAudit(client: PoolClient, actorId: string, action: string, targetId: string, details: unknown) {
  await client.query(`INSERT INTO app_settings(key,value) VALUES($1,$2::jsonb)`, [
    `staff_audit:${randomUUID()}`, JSON.stringify({ actorId, action, targetId, details, createdAt: new Date().toISOString() }),
  ]);
}
