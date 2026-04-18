import { del, put } from '@vercel/blob';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

function blobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isVercelBlobUrl(url: string): boolean {
  return url.includes('blob.vercel-storage.com');
}

/**
 * Сохраняет изображение: в проде на Vercel (и где задан BLOB_READ_WRITE_TOKEN) — в Blob CDN;
 * иначе в public/uploads (только если диск персистентный, иначе в serverless файлы не раздаются).
 */
export async function savePublicImage(
  file: File,
  folder: 'avatars' | 'products'
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('TYPE');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('SIZE');
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeExt = ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const filename = `${uuidv4()}.${safeExt}`;

  if (blobStorageConfigured()) {
    const blob = await put(`${folder}/${filename}`, file, {
      access: 'public',
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function deletePublicImage(url: string | null | undefined): Promise<void> {
  if (!url) return;

  if (url.startsWith('/uploads/')) {
    const relative = url.replace(/^\/+/, '').split('/').filter(Boolean);
    if (relative[0] !== 'uploads') return;
    const base = path.join(process.cwd(), 'public', 'uploads');
    const resolved = path.join(process.cwd(), 'public', ...relative);
    if (!resolved.startsWith(base)) return;
    await unlink(resolved).catch(() => undefined);
    return;
  }

  if (blobStorageConfigured() && isVercelBlobUrl(url)) {
    await del(url).catch(() => undefined);
  }
}
