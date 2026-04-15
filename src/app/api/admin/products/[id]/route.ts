import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, image, categoryId, isAvailable, calories, proteins, fats, carbs, sortOrder, ingredients } = body;

    if (ingredients) {
      await prisma.productIngredient.deleteMany({ where: { productId: id } });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(image !== undefined && { image }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(calories !== undefined && { calories: calories ? parseFloat(calories) : null }),
        ...(proteins !== undefined && { proteins: proteins ? parseFloat(proteins) : null }),
        ...(fats !== undefined && { fats: fats ? parseFloat(fats) : null }),
        ...(carbs !== undefined && { carbs: carbs ? parseFloat(carbs) : null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(ingredients && {
          ingredients: {
            create: ingredients.map((ing: { ingredientId: string; isDefault: boolean; isRemovable: boolean; isExtra: boolean }) => ({
              ingredientId: ing.ingredientId,
              isDefault: ing.isDefault ?? true,
              isRemovable: ing.isRemovable ?? true,
              isExtra: ing.isExtra ?? false,
            })),
          },
        }),
      },
      include: { category: true, ingredients: { include: { ingredient: true } } },
    });

    return NextResponse.json({ product });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Update product error:', e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Delete product error:', e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
