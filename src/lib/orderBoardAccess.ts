import { getCurrentUser } from './auth';
import { hasPermission, isStaff } from './roles';
import { isKioskUnlocked, KioskUnauthorizedError } from './kioskAuth';

export async function boardAccess() {
  const user = await getCurrentUser();
  if (isStaff(user)) return { unlocked: hasPermission(user, 'kitchen'), canComplete: hasPermission(user, 'orders'), user };
  // A manual client assignment cannot regain employee rights through a remembered PIN.
  if (user?.staffRoles != null) return { unlocked: false, canComplete: false, user };
  const unlocked = await isKioskUnlocked();
  return { unlocked, canComplete: unlocked, user: null };
}
export async function requireBoardAccess() {
  const access = await boardAccess();
  if (!access.unlocked) throw new KioskUnauthorizedError();
  return access;
}
