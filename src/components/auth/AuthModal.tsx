'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import AuthForm from '@/components/auth/AuthForm';
import { useAuthModalStore } from '@/store/authModalStore';
import { useAuthStore } from '@/store/authStore';

export default function AuthModal() {
  const router = useRouter();
  const open = useAuthModalStore((s) => s.open);
  const redirect = useAuthModalStore((s) => s.redirect);
  const preferRegister = useAuthModalStore((s) => s.preferRegister);
  const closeAuth = useAuthModalStore((s) => s.closeAuth);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuth();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeAuth]);

  if (!open) return null;

  async function handleSuccess() {
    const target = redirect;
    closeAuth();
    await fetchUser();
    if (target && target !== '/' && !target.startsWith('/auth')) {
      router.push(target);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end justify-center sm:items-center sm:p-4"
      data-mobile-ui
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={closeAuth}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="glass-panel-strong relative z-[1] max-h-[min(92dvh,720px)] w-full max-w-md overflow-y-auto rounded-t-[1.5rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[1.5rem] sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p id="auth-modal-title" className="sr-only">
            Вход и регистрация
          </p>
          <button
            type="button"
            className="btn-icon ml-auto size-9"
            onClick={closeAuth}
            aria-label="Закрыть"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
        <AuthForm
          key={preferRegister ? 'register' : 'login'}
          compact
          initialMode={preferRegister ? 'register' : 'login'}
          onSuccess={() => void handleSuccess()}
        />
      </div>
    </div>
  );
}
