import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

const mime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Next production scans public at startup. Serve newly uploaded local photos immediately. */
export async function GET(_request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) return new Response(null, { status: 404 });
  try {
    const content = await readFile(path.join(process.cwd(), 'public', 'uploads', filename));
    return new Response(new Uint8Array(content), { headers: {
      'Content-Type': mime[filename.split('.').pop()!.toLowerCase()],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 });
    console.error('Local image read:', error);
    return new Response(null, { status: 500 });
  }
}
