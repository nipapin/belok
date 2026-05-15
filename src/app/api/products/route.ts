import { NextRequest, NextResponse } from 'next/server';
import { fetchProductsWithRelations } from '@/lib/queries/products';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    const products = await fetchProductsWithRelations({
      onlyAvailable: true,
      categoryId,
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
