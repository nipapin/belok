import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  try {
    await requireAdmin();
    const products = await prisma.product.findMany({
      include: {
        category: true,
        ingredients: { include: { ingredient: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ products });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { name, description, price, image, categoryId, isAvailable, calories, proteins, fats, carbs, sortOrder, ingredients } = body;

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        image,
        categoryId,
        isAvailable: isAvailable ?? true,
        calories: calories ? parseFloat(calories) : null,
        proteins: proteins ? parseFloat(proteins) : null,
        fats: fats ? parseFloat(fats) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        sortOrder: sortOrder ?? 0,
        ingredients: ingredients
          ? {
              create: ingredients.map((ing: { ingredientId: string; isDefault: boolean; isRemovable: boolean; isExtra: boolean }) => ({
                ingredientId: ing.ingredientId,
                isDefault: ing.isDefault ?? true,
                isRemovable: ing.isRemovable ?? true,
                isExtra: ing.isExtra ?? false,
              })),
            }
          : undefined,
      },
      include: { category: true, ingredients: { include: { ingredient: true } } },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Create product error:', e);
    return NextResponse.json({ error: 'Ошибка создания товара' }, { status: 500 });
  }
}
