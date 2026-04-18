import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { savePublicImage } from '@/lib/uploadStorage';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
    }

    let url: string;
    try {
      url = await savePublicImage(file, 'products');
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

    return NextResponse.json({ url });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 });
  }
}
