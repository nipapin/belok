import { NextRequest, NextResponse } from 'next/server';
import { fetchProductByHandle } from '@/lib/queries/products';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await fetchProductByHandle(id);
    if (!product || !product.category.isActive) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ product }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Get product error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
