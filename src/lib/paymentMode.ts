export const PAYMENTS_DISABLED_MESSAGE = 'Оплаты и операции кассы отключены: работаем с внутренними процессами.';

export function paymentsDisabled(): boolean {
  return process.env.BELOK_PAYMENTS_DISABLED === 'true' ||
    process.env.NEXT_PUBLIC_PAYMENTS_DISABLED === 'true' ||
    process.env.NODE_ENV === 'development';
}

export function requirePaymentsEnabled(): void {
  if (paymentsDisabled()) throw new Error(PAYMENTS_DISABLED_MESSAGE);
}
