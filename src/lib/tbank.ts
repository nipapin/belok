import 'server-only';
import { createHash } from 'node:crypto';

const API_URL = 'https://securepay.tinkoff.ru/v2';
const SBP_QR_TTL_MINUTES = 20;

export const SBP_MIN_RUBLES = 10;

export class TbankError extends Error {
  constructor(
    message: string,
    readonly errorCode?: string,
    readonly details?: string
  ) {
    super(message);
    this.name = 'TbankError';
  }
}

export function isTbankConfigured(): boolean {
  return Boolean(process.env.TBANK_TERMINAL_KEY?.trim() && process.env.TBANK_PASSWORD);
}

function credentials(): { terminalKey: string; password: string } {
  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim();
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || password == null || password === '') {
    throw new TbankError('Терминал Т-Банка не настроен');
  }
  return { terminalKey, password };
}

export function tbankAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function tbankToken(params: Record<string, unknown>, password: string): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(params)) {
    if (key === 'Token' || key === 'Password') continue;
    if (value == null) continue;
    if (typeof value === 'object') continue;
    pairs.push([key, String(value)]);
  }
  pairs.push(['Password', password]);
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(pairs.map(([, v]) => v).join(''), 'utf8').digest('hex');
}

export function verifyTbankNotification(body: Record<string, unknown>): boolean {
  const { password } = credentials();
  const token = body.Token;
  if (typeof token !== 'string' || !token) return false;
  return tbankToken(body, password) === token;
}

function redirectDueDate(minutesFromNow: number): string {
  const due = new Date(Date.now() + minutesFromNow * 60_000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(due);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+03:00`;
}

if (process.env.TBANK_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function tbankRequest<T extends Record<string, unknown>>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const { terminalKey, password } = credentials();
  const payload = { TerminalKey: terminalKey, ...params };
  const body = { ...payload, Token: tbankToken(payload, password) };
  const res = await fetch(`${API_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!data) {
    throw new TbankError(`Т-Банк ${method}: пустой ответ`, String(res.status));
  }
  return data;
}

export function paymentIdToString(id: string | number | undefined | null): string | null {
  if (id == null || id === '') return null;
  return String(id);
}

export function assertTbankSuccess<
  T extends { Success?: boolean; Message?: string; Details?: string; ErrorCode?: string },
>(result: T, fallback: string): T {
  if (!result.Success) {
    if (result.ErrorCode === '204') {
      const password = process.env.TBANK_PASSWORD ?? '';
      console.error('T-Bank token rejected (204). Password length:', password.length, 'has &:', password.includes('&'));
    }
    throw new TbankError(result.Message || result.Details || fallback, result.ErrorCode, result.Details);
  }
  return result;
}

export type TbankInitResult = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  PaymentId?: string | number;
  Status?: string;
  PaymentURL?: string;
};

export async function tbankInit(args: {
  amountKopecks: number;
  orderId: string;
  description: string;
  method: 'card' | 'sbp';
}): Promise<TbankInitResult> {
  const origin = tbankAppOrigin();
  const params: Record<string, unknown> = {
    Amount: args.amountKopecks,
    OrderId: args.orderId,
    Description: args.description.slice(0, 140),
    PayType: 'O',
    Language: 'ru',
    NotificationURL: `${origin}/api/payments/tbank/notify`,
    SuccessURL: `${origin}/orders/${args.orderId}`,
    FailURL: `${origin}/orders/${args.orderId}`,
    RedirectDueDate: redirectDueDate(SBP_QR_TTL_MINUTES),
  };
  if (args.method === 'sbp') {
    params.DATA = { QR: 'true' };
  }
  return tbankRequest<TbankInitResult>('Init', params);
}

export type TbankQrResult = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Data?: string;
};

export async function tbankGetQr(
  paymentId: string,
  dataType: 'PAYLOAD' | 'IMAGE' = 'PAYLOAD'
): Promise<TbankQrResult> {
  return tbankRequest<TbankQrResult>('GetQr', {
    PaymentId: paymentId,
    DataType: dataType,
  });
}

export type TbankStateResult = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Status?: string;
  PaymentId?: string | number;
  OrderId?: string;
  Amount?: number;
};

export async function tbankGetState(paymentId: string): Promise<TbankStateResult> {
  return tbankRequest<TbankStateResult>('GetState', { PaymentId: paymentId });
}

export type TbankCancelResult = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Status?: string;
};

export async function tbankCancel(paymentId: string): Promise<TbankCancelResult> {
  return tbankRequest<TbankCancelResult>('Cancel', { PaymentId: paymentId });
}

const ALREADY_VOID = new Set(['REFUNDED', 'REVERSED', 'CANCELED', 'CANCELLED']);

export function isTbankAlreadyVoided(result: TbankCancelResult): boolean {
  const status = (result.Status || '').toUpperCase();
  return ALREADY_VOID.has(status);
}
