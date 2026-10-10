import {getCurrentUser} from '@/lib/auth';
import {queryOne} from '@/lib/db';

export type InventoryPermission='view'|'catalog'|'stock'|'produce'|'manage_access'|'audit';
type InventoryRole='SUPERADMIN'|'MANAGER'|'STOCK'|'VIEWER';
const allowed:Record<InventoryRole,InventoryPermission[]>={
 SUPERADMIN:['view','catalog','stock','produce','manage_access','audit'],
 MANAGER:['view','catalog','stock','produce','audit'],
 STOCK:['view','stock','produce'],
 VIEWER:['view']
};
export async function requireInventoryPermission(permission:InventoryPermission){
 const user=await getCurrentUser();
 if(!user||user.role!=='ADMIN')throw Error('UNAUTHORIZED');
 const assigned=await queryOne<{access_role:InventoryRole}>(`SELECT access_role FROM inventory_access WHERE user_id=$1`,[user.id]);
 // Migration-safe fallback: existing admins can operate inventory but cannot grant privileges.
 const role=assigned?.access_role??'MANAGER';
 if(!allowed[role]?.includes(permission))throw Error('FORBIDDEN');
 return user;
}
