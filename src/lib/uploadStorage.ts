import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { del, put } from '@vercel/blob';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

function blobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function s3StorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

function getS3Region(): string {
  return process.env.S3_REGION ?? 'ru-1';
}

/** Публичный origin для ссылок на объекты (без завершающего `/`). */
function getS3PublicBaseUrl(): string {
  const explicit = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) return '';
  return `${endpoint}/${bucket}`;
}

function getS3ForcePathStyle(): boolean {
  if (process.env.S3_FORCE_PATH_STYLE === 'false') return false;
  if (process.env.S3_FORCE_PATH_STYLE === 'true') return true;
  return true;
}

function getS3Client(): S3Client {
  return new S3Client({
    region: getS3Region(),
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: getS3ForcePathStyle(),
  });
}

function isVercelBlobUrl(url: string): boolean {
  return url.includes('blob.vercel-storage.com');
}

function isOurS3PublicUrl(url: string): boolean {
  const base = getS3PublicBaseUrl();
  if (!base) return false;
  return url === base || url.startsWith(`${base}/`);
}

function s3ObjectKeyFromPublicUrl(url: string): string | null {
  if (!isOurS3PublicUrl(url)) return null;
  const base = getS3PublicBaseUrl();
  return url.slice(base.length).replace(/^\//, '');
}

/**
 * Сохраняет изображение: при настроенных S3 — в S3-совместимое хранилище;
 * иначе на Vercel (BLOB_READ_WRITE_TOKEN) — в Blob CDN; иначе в public/uploads
 * (нужен персистентный диск, иначе в serverless файлы не раздаются).
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
  const key = `${folder}/${filename}`;

  if (s3StorageConfigured()) {
    const body = Buffer.from(await file.arrayBuffer());
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    return `${getS3PublicBaseUrl()}/${key}`;
  }

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

  if (s3StorageConfigured() && isOurS3PublicUrl(url)) {
    const key = s3ObjectKeyFromPublicUrl(url);
    if (key) {
      const client = getS3Client();
      await client
        .send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: key,
          })
        )
        .catch(() => undefined);
    }
    return;
  }

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
