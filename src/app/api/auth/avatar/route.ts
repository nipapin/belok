import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserWithLoyaltyById } from '@/lib/auth';
import { query } from '@/lib/db';
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

    await query(`UPDATE "users" SET "avatarUrl" = $1 WHERE id = $2`, [url, user.id]);
    const updated = await getUserWithLoyaltyById(user.id);
    if (!updated) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });

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
    await query(`UPDATE "users" SET "avatarUrl" = NULL WHERE id = $1`, [user.id]);
    const updated = await getUserWithLoyaltyById(user.id);
    if (!updated) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 500 });

    await deletePublicImage(prev);

    return NextResponse.json({ user: toClientUser(updated) });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
