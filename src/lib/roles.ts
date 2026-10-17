/** Legacy database roles stay intact. A manual assignment overrides their permissions. */
export const staffRoles = ['OWNER', 'MANAGER', 'CASHIER', 'COOK', 'STOCKKEEPER', 'USER'] as const;
export type StaffRole = typeof staffRoles[number];
export type AccessUser = { role: string; staffRoles?: readonly string[] | null };
export const roleLabels: Record<string, string> = {
  USER: 'Клиент', ADMIN: 'Администратор', OWNER: 'Владелец', MANAGER: 'Управляющий',
  CASHIER: 'Кассир', COOK: 'Повар', STOCKKEEPER: 'Кладовщик',
};
export type Permission = 'settings' | 'menu' | 'reports' | 'people' | 'orders' | 'refund'
  | 'cashier' | 'kitchen' | 'availability' | 'inventory' | 'inventory_catalog'
  | 'inventory_stock' | 'inventory_produce' | 'inventory_access' | 'audit' | 'checklists';
const grants: Record<string, readonly Permission[]> = {
  MANAGER: ['menu', 'reports', 'people', 'orders', 'refund', 'cashier', 'kitchen', 'availability', 'inventory', 'inventory_catalog', 'inventory_stock', 'inventory_produce', 'audit', 'checklists'],
  CASHIER: ['orders', 'cashier', 'kitchen', 'checklists'],
  COOK: ['kitchen', 'availability', 'checklists'],
  STOCKKEEPER: ['inventory', 'inventory_stock', 'inventory_produce', 'checklists'],
  USER: [],
};
export function effectiveRoles(user: AccessUser | null | undefined): readonly string[] {
  if (!user) return [];
  return user.staffRoles ?? [user.role];
}
export function hasPermission(user: AccessUser | null | undefined, permission: Permission): boolean {
  return effectiveRoles(user).some(role => role === 'ADMIN' || role === 'OWNER' || grants[role]?.includes(permission));
}
export function isStaff(user: AccessUser | null | undefined): boolean {
  return effectiveRoles(user).some(role => role === 'ADMIN' || (staffRoles as readonly string[]).includes(role) && role !== 'USER');
}
export function displayRoles(user: AccessUser): string {
  return effectiveRoles(user).map(role => roleLabels[role] ?? role).join(', ') || 'Клиент';
}
export function validStaffRoles(value: unknown): value is StaffRole[] {
  return Array.isArray(value) && value.length > 0 && value.length <= staffRoles.length
    && value.every(role => typeof role === 'string' && (staffRoles as readonly string[]).includes(role))
    && new Set(value).size === value.length && (!value.includes('USER') || value.length === 1);
}
export function canAssignRoles(actor: AccessUser, target: AccessUser, roles: readonly string[] | null): boolean {
  if (hasPermission(actor, 'settings')) return true;
  if (!hasPermission(actor, 'people')) return false;
  const operational = ['USER', 'CASHIER', 'COOK', 'STOCKKEEPER'];
  return effectiveRoles(target).every(role => operational.includes(role))
    && (roles ?? [target.role]).every(role => operational.includes(role));
}
const pagePermissions: Record<string, Permission> = {
  '/admin': 'reports', '/admin/manager': 'reports', '/admin/reports': 'reports', '/admin/revenue': 'reports', '/admin/dish-sales': 'reports', '/admin/orders': 'orders',
  '/admin/loyalty': 'cashier', '/admin/products': 'menu', '/admin/products-v2': 'menu', '/admin/categories': 'menu', '/admin/ingredients': 'menu',
  '/admin/inventory': 'inventory', '/admin/recipes': 'inventory', '/admin/kitchen': 'menu', '/kitchen': 'kitchen',
  '/order-board': 'kitchen', '/admin/hits': 'menu', '/admin/users': 'people', '/admin/employees': 'people',
  '/admin/audit': 'audit', '/admin/availability': 'availability', '/admin/checklists': 'checklists',
};
export function canAccessPage(user: AccessUser | null | undefined, path: string): boolean {
  const root = Object.keys(pagePermissions).filter(key => path === key || path.startsWith(`${key}/`)).sort((a, b) => b.length - a.length)[0];
  // Unknown administrative pages are reserved for the owner/legacy admin.
  return hasPermission(user, root && root !== '/admin' ? pagePermissions[root] : path === '/admin' ? 'reports' : 'settings');
}
export function staffHome(user: AccessUser): string {
  if (hasPermission(user, 'reports')) return '/admin';
  if (hasPermission(user, 'orders')) return '/admin/orders';
  if (hasPermission(user, 'kitchen')) return '/order-board';
  if (hasPermission(user, 'inventory')) return '/admin/inventory';
  return '/menu';
}

export function canSetOrderStatus(user: AccessUser | null | undefined, before: {status:string;paymentStatus:string}, next: string): boolean {
  if (!hasPermission(user, 'orders')) return false;
  if (hasPermission(user, 'refund')) return true;
  if (next === 'CANCELLED') return before.paymentStatus === 'PENDING' && before.status !== 'COMPLETED';
  return next === before.status
    || next === 'CONFIRMED' && before.status === 'PENDING'
    || next === 'PREPARING' && ['PENDING', 'CONFIRMED'].includes(before.status)
    || next === 'READY' && before.status === 'PREPARING'
    || next === 'COMPLETED' && before.status === 'READY';
}
