import type { OrderSource } from '@/lib/types';

export type OrderCustomerUser = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null;

export function orderTicket(order: { id: string; dailyNumber?: number | null }): string {
  const raw = order.dailyNumber;
  const n = typeof raw === 'number' ? raw : raw != null ? Number(raw) : NaN;
  if (Number.isInteger(n) && n > 0) return `#${n}`;
  return `#${order.id.slice(0, 8)}`;
}

export function formatGuestOrderNumber(order: { id: string; dailyNumber?: number | null }): string {
  return `Гость ${orderTicket(order)}`;
}

export function orderCustomerLabel(input: {
  id: string;
  dailyNumber?: number | null;
  guestEmail?: string | null;
  user?: OrderCustomerUser;
}): string {
  const userLabel = input.user?.name || input.user?.email || input.user?.phone;
  if (userLabel) return userLabel;
  if (input.guestEmail) return input.guestEmail;
  return formatGuestOrderNumber(input);
}

export function isKioskSource(source: OrderSource | string | null | undefined): boolean {
  return source === 'KIOSK';
}

export function fulfillmentLabel(value?: string | null): string | null {
  if (value === 'DELIVERY') return 'Доставка';
  if (value === 'PICKUP') return 'Самовывоз';
  return null;
}

export function paymentMethodLabel(value?: string | null): string | null {
  if (value === 'CARD') return 'Карта';
  if (value === 'CASH') return 'Наличные';
  if (value === 'SBP') return 'СБП';
  if (value === 'BONUS') return 'Бонусы';
  return null;
}

export function formatDeliveryTime(value?: string | null): string | null {
  if (!value) return null;
  if (value === 'ASAP') return 'Как можно быстрее';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
