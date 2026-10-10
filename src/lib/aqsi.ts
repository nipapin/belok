import 'server-only';
import { gzipSync } from 'node:zlib';

const BASE = 'https://api.aqsi.ru/pub';

export class AqsiRequestError extends Error {
  constructor(message: string, readonly ambiguous: boolean) { super(message); }
}

// Never retry a money/receipt POST after a lost response: this API does not
// document a caller-supplied idempotency key for device operations.
export async function aqsiRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const raw = process.env.AQSI_API_KEY?.trim();
  if (!raw) throw new AqsiRequestError('API-ключ aQsi не настроен', false);
  const key = raw.startsWith('Application ') ? raw : `Application ${raw}`;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method, headers: { 'x-client-key': key, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new AqsiRequestError('Нет ответа от aQsi. Требуется проверить результат операции.', true); }
  if (!response.ok) {
    // Provider error bodies can contain account details; keep credentials and
    // untrusted upstream text out of logs and customer-facing responses.
    throw new AqsiRequestError(`aQsi: HTTP ${response.status}`, response.status >= 500);
  }
  const text = await response.text();
  if (!text) return undefined as T;
  try { return JSON.parse(text) as T; }
  catch { throw new AqsiRequestError('aQsi вернул непонятный ответ', true); }
}

export interface AqsiOperation {
  operationId: string; deviceId: number; type: string;
  status: 'Pending' | 'Processing' | 'Finishing' | 'Completed' | 'Canceled' | 'Timeout' | 'Error';
  result?: string | null; problems?: string | null; message?: string | null;
}

export async function aqsiBulk(path: string, payload: unknown[]): Promise<string> {
  const form = new FormData();
  const bytes = gzipSync(JSON.stringify({ payload, removeObsolete: false, nonAtomic: false }));
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'application/gzip' }), 'catalog.json.gz');
  const result = await aqsiRequest<{ guid?: string }>(path, 'POST', form);
  if (!result?.guid) throw new AqsiRequestError('aQsi не вернул ID загрузки каталога', true);
  return result.guid;
}
