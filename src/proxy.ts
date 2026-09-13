import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionIdFromCookie } from '@/lib/sessionCookie';

/** Profile is client-gated (auth modal). Orders/checkout still need a session. */
const protectedRoutes = ['/orders', '/checkout'];
const adminRoutes = ['/admin'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));
  const isAdmin = adminRoutes.some((r) => pathname.startsWith(r));

  if (!isProtected && !isAdmin) {
    return NextResponse.next();
  }

  const rawSessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = readSessionIdFromCookie(rawSessionCookie);
  if (!sessionId) {
    const home = new URL('/', request.url);
    home.searchParams.set('auth', '1');
    home.searchParams.set('redirect', pathname);
    return NextResponse.redirect(home);
  }

  // Admin role validation needs the DB; route handlers/pages do it themselves
  // (e.g. requireAdmin in lib/adminAuth.ts). The proxy only checks that the
  // visitor has *some* signed session cookie, to avoid a redirect loop.

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/orders/:path*',
    '/checkout/:path*',
    '/admin/:path*',
  ],
};
