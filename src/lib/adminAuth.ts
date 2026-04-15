import { getCurrentUser } from './auth';

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
