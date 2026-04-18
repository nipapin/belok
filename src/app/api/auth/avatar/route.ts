import { NextRequest, NextResponse } from 'next/server';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { toClientUser } from '@/lib/userClient';

const UPLOADS_SEGMENT = `${path.sep}public${path.sep}uploads`;

function safeUnlinkUploadFile(publicUrl: string | null) {
  if (!publicUrl?.startsWith('/uploads/')) return;
  const relative = publicUrl.replace(/^\/+/, '').split('/').filter(Boolean);
  if (relative[0] !== 'uploads') return;
  const base = path.join(process.cwd(), 'public', 'uploads');
  const resolved = path.join(process.cwd(), 'public', ...relative);
  if (!resolved.startsWith(base)) return;
  return unlink(resolved).catch(() => undefined);
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

async function saveAvatarFile(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('TYPE');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('SIZE');
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeExt = ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const filename = `${uuidv4()}.${safeExt}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

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
      url = await saveAvatarFile(file);
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

    await safeUnlinkUploadFile(user.avatarUrl);

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

    await safeUnlinkUploadFile(prev);

    return NextResponse.json({ user: toClientUser(updated) });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
