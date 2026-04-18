import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { deletePublicImage, savePublicImage } from '@/lib/uploadStorage';
import { toClientUser } from '@/lib/userClient';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
    }

    let url: string;
    try {
      url = await savePublicImage(file, 'avatars');
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'TYPE') {
        return NextResponse.json(
          { error: 'Допустимы только изображения (JPEG, PNG, WebP, GIF)' },
          { status: 400 }
        );
      }
      if (code === 'SIZE') {
        return NextResponse.json({ error: 'Максимальный размер файла — 5 МБ' }, { status: 400 });
      }
      throw e;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: url },
      include: { loyaltyLevel: true },
    });

    await deletePublicImage(user.avatarUrl);

    return NextResponse.json({ user: toClientUser(updated) });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const prev = user.avatarUrl;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
      include: { loyaltyLevel: true },
    });

    await deletePublicImage(prev);

    return NextResponse.json({ user: toClientUser(updated) });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
