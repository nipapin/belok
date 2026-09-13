'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthModalStore } from '@/store/authModalStore';

/**
 * Opens the auth modal when the URL has ?auth=1 (from proxy redirects).
 */
function AuthQueryOpenerInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const openAuth = useAuthModalStore((s) => s.openAuth);

  useEffect(() => {
    if (searchParams.get('auth') !== '1') return;
    const redirect = searchParams.get('redirect');
    const safe =
      redirect && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : null;
    const emailRaw = searchParams.get('email')?.trim() ?? '';
    openAuth({
      redirect: safe,
      preferRegister: searchParams.get('register') === '1',
      initialEmail: emailRaw || null,
    });

    const next = new URLSearchParams(searchParams.toString());
    next.delete('auth');
    next.delete('redirect');
    next.delete('register');
    next.delete('email');
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [searchParams, pathname, router, openAuth]);

  return null;
}

export default function AuthQueryOpener() {
  return (
    <Suspense fallback={null}>
      <AuthQueryOpenerInner />
    </Suspense>
  );
}
