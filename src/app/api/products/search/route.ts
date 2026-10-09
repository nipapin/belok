import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { fetchProductsWithRelations } from '@/lib/queries/products';
import { clientIpFromHeaders, rateLimit } from '@/lib/rateLimit';
import { menuSearchQuery, searchMenu, searchableMenu, validateSelections } from '@/lib/menuSearch.server';

export const runtime = 'nodejs';
const schema = z.object({ query: menuSearchQuery }).strict();
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return NextResponse.json(
      { error: 'Войдите в аккаунт, чтобы пользоваться AI-подбором.', code: 'AUTH_REQUIRED' },
      { status: 401, headers },
    );
  } catch {
    return NextResponse.json(
      { error: 'Не удалось проверить вход. Попробуйте ещё раз.' }, { status: 503, headers },
    );
  }
  const limit = rateLimit(`menu-search:${clientIpFromHeaders(request.headers)}`, 10, 60);
  if (!limit.allowed) return NextResponse.json(
    { error: 'Слишком много запросов. Попробуйте через минуту.' },
    { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } },
  );
  let input: z.infer<typeof schema>;
  try {
    // Bound the stream as well as the declared length (which clients can omit).
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new Error('Large body'); }
      chunks.push(chunk.value);
    }
    input = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    return NextResponse.json({ error: 'Введите запрос от 3 до 240 символов.' }, { status: 400, headers });
  }

  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) return NextResponse.json(
    { error: 'Подбор сейчас недоступен. Можно искать по названию.' }, { status: 503, headers },
  );
  try {
    const menu = await fetchProductsWithRelations({ onlyAvailable: true });
    const selections = await searchMenu(input.query, menu, {
      baseUrl, apiKey, model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    });
    // A product may be disabled or repriced while the model is working.
    const current = selections.length ? searchableMenu(await fetchProductsWithRelations({
      onlyAvailable: true, productIds: selections.map((match) => match.productId),
    })) : [];
    const matches = validateSelections({ matches: selections }, current).map((match) => ({
      product: current.find((product) => product.id === match.productId)!, variantId: match.variantId,
    }));
    return NextResponse.json({ matches }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Подбор сейчас недоступен. Можно искать по названию.' }, { status: 503, headers },
    );
  }
}
