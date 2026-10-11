import { getCurrentUser } from './auth';
import { hasPermission, type Permission } from './roles';

/** Default remains restricted to legacy admins and owners; never broadens existing guards. */
export async function requireAdmin(permission: Permission = 'settings') {
  const user = await getCurrentUser();
  if (!hasPermission(user, permission)) throw new Error('UNAUTHORIZED');
  return user!;
}
