'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthModalStore } from '@/store/authModalStore';

/**
 * Deep-link / proxy entry: /auth?redirect=… opens the auth modal on the
 * destination page (or home) instead of showing a standalone auth screen.
 */
function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openAuth = useAuthModalStore((s) => s.openAuth);

  useEffect(() => {
    const redirect = searchParams.get('redirect') || '/';
    const safe =
      redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
    openAuth({ redirect: safe === '/' ? null : safe });
    router.replace(safe === '/' ? '/' : safe);
  }, [openAuth, router, searchParams]);

  return (
    <div className="py-24 text-center text-sm text-(--lg-text-muted)">Открываем вход…</div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-(--lg-text-muted)">Загрузка…</div>}>
      <AuthPageInner />
    </Suspense>
  );
}
