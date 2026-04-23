import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';
import { deletePublicImage } from '@/lib/uploadStorage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, ingredients: { include: { ingredient: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, image, categoryId, isAvailable, calories, proteins, fats, carbs, fiber, sortOrder, ingredients } = body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }

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
        ...(fiber !== undefined && { fiber: fiber ? parseFloat(fiber) : null }),
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

    if (image !== undefined && existing.image && existing.image !== image) {
      await deletePublicImage(existing.image);
    }

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
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }
    await deletePublicImage(existing.image);
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Delete product error:', e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
