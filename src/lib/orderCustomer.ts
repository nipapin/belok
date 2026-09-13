import type { OrderSource } from '@/lib/types';

export type OrderCustomerUser = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null;

export function formatGuestOrderNumber(orderId: string): string {
  return `Гость №${orderId.slice(0, 8)}`;
}

export function orderCustomerLabel(input: {
  id: string;
  guestEmail?: string | null;
  user?: OrderCustomerUser;
}): string {
  const userLabel = input.user?.name || input.user?.email || input.user?.phone;
  if (userLabel) return userLabel;
  if (input.guestEmail) return input.guestEmail;
  return formatGuestOrderNumber(input.id);
}

export function isKioskSource(source: OrderSource | string | null | undefined): boolean {
  return source === 'KIOSK';
}
