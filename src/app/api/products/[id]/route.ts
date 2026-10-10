import { NextRequest, NextResponse } from 'next/server';
import { fetchProductById } from '@/lib/queries/products';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await fetchProductById(id);
    if (!product) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ product }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Get product error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
