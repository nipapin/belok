"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Gift, LayoutDashboard, Loader2, LogOut, Receipt, ScanLine, UserCircle2, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useHydrated } from "@/hooks/useHydrated";
import { useQuery } from "@tanstack/react-query";
import LoyaltyCard from "@/components/loyalty/LoyaltyCard";
import PushToggle from "@/components/notifications/PushToggle";

export default function ProfilePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { user, isLoading, setUser, logout } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [saved, setSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!avatarModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAvatarModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarModalOpen]);

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/auth?redirect=/profile";
    }
  }, [isLoading, user]);

  const { data: bonusData } = useQuery({
    queryKey: ["bonuses"],
    queryFn: () => fetch("/api/bonuses").then((r) => r.json()),
    enabled: !!user,
  });

  const levels = bonusData?.levels as
    | { id: string; name: string; minSpent: number; cashbackPercent: number; discountPercent: number }[]
    | undefined;
  const currentLevel = bonusData?.currentLevel ?? user?.loyaltyLevel ?? null;

  const handleSave = async () => {
    const res = await fetch("/api/auth/update-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const handleAvatarPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarError(typeof data.error === "string" ? data.error : "Не удалось загрузить фото");
        return;
      }
      setUser(data.user);
    } catch {
      setAvatarError("Ошибка соединения");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError("");
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarError(typeof data.error === "string" ? data.error : "Не удалось удалить фото");
        return;
      }
      setUser(data.user);
    } catch {
      setAvatarError("Ошибка соединения");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleReplacePhoto = () => {
    setAvatarModalOpen(false);
    requestAnimationFrame(() => avatarFileInputRef.current?.click());
  };

  const avatarTriggerClass =
    "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--lg-ring) bg-(--lg-fill) backdrop-blur-sm transition";

  if (!hydrated || isLoading || !user) {
    return (
      <div className="mx-auto flex max-w-md justify-center px-2 py-24">
        <Loader2 className="size-8 animate-spin text-(--lg-text-muted)" />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-md px-2 pb-6 pt-2">
        {saved && <div className="profile-alert-success mb-4">Профиль обновлён</div>}
        {avatarError && <div className="auth-alert-error mb-4">{avatarError}</div>}

        <input
          ref={avatarFileInputRef}
          id="profile-avatar-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={handleAvatarPick}
          disabled={avatarBusy}
          aria-hidden
          tabIndex={-1}
        />

        <div className="glass-panel mb-4 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="shrink-0">
              {avatarBusy ? (
                <div className={`${avatarTriggerClass} cursor-wait`} aria-busy>
                  <Loader2 className="size-7 animate-spin text-(--lg-text-muted)" />
                </div>
              ) : user.avatarUrl ? (
                <button
                  type="button"
                  className={`${avatarTriggerClass} cursor-pointer`}
                  onClick={() => setAvatarModalOpen(true)}
                  aria-label="Изменить фото профиля"
                  aria-haspopup="dialog"
                >
                  <Image src={user.avatarUrl} alt="" width={64} height={64} className="size-full object-cover" unoptimized />
                </button>
              ) : (
                <label
                  htmlFor="profile-avatar-file"
                  className={`${avatarTriggerClass} cursor-pointer`}
                  aria-label="Загрузить фото профиля"
                >
                  <UserCircle2 className="size-13 text-(--lg-text-muted)" strokeWidth={1.25} />
                </label>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-(--lg-text)">{user.name || "Гость"}</h2>
              <p className="text-sm text-(--lg-text-muted)">{user.email || user.phone || "—"}</p>
            </div>
          </div>

          {editing ? (
            <div className="flex flex-col gap-3">
              <label className="block text-sm font-medium text-(--lg-text)">
                Имя
                <input className="input-pill mt-1.5 min-h-11" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-(--lg-text)">
                Электронная почта
                <input className="input-pill mt-1.5 min-h-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="btn-primary px-5 py-2.5 text-sm" onClick={handleSave}>
                  Сохранить
                </button>
                <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-outline py-2.5 text-sm"
              onClick={() => {
                setName(user.name || "");
                setEmail(user.email || "");
                setEditing(true);
              }}
            >
              Редактировать
            </button>
          )}
        </div>

        {user.role === "ADMIN" ? (
          <>
            <button
              type="button"
              onClick={() => router.push("/admin/loyalty")}
              className="profile-scan-cta mb-3 flex w-full cursor-pointer items-center gap-4 rounded-3xl p-5 text-left"
            >
              <span className="profile-scan-cta-icon flex size-12 shrink-0 items-center justify-center rounded-2xl">
                <ScanLine className="size-6" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">Сканировать QR-код</span>
                <span className="profile-scan-cta-hint mt-0.5 block text-xs">
                  Начислить бонусы клиенту по QR-коду
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="glass-panel-strong lg-interactive mb-4 flex w-full cursor-pointer items-center gap-3 border border-(--lg-ring) p-4 text-left"
            >
              <LayoutDashboard className="size-5 shrink-0 text-(--lg-text)" strokeWidth={1.75} />
              <span className="font-semibold text-(--lg-text)">Админ-панель</span>
            </button>

            <hr className="profile-divider" />
          </>
        ) : (
          <>
            <LoyaltyCard
              userId={user.id}
              userName={user.name}
              bonusBalance={user.bonusBalance}
              totalSpent={user.totalSpent || 0}
              currentLevel={currentLevel}
              levels={levels}
            />

            <p className="mb-4 px-1 text-center text-xs text-(--lg-text-muted)">
              1 бонус = 1 ₽ · можно оплатить до 100% суммы заказа
            </p>

            <hr className="profile-divider" />
          </>
        )}

        {[
          { label: "История заказов", icon: Receipt, path: "/orders" },
          { label: "Детализация бонусов", icon: Gift, path: "/profile/bonuses" },
        ].map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => router.push(item.path)}
            className="glass-panel lg-interactive mb-2 flex w-full cursor-pointer items-center gap-3 p-4 text-left"
          >
            <item.icon className="size-5 shrink-0 text-(--lg-text-muted)" strokeWidth={1.75} />
            <span className="font-medium text-(--lg-text)">{item.label}</span>
          </button>
        ))}

        <div className="mt-4">
          <PushToggle />
        </div>

        <button type="button" className="profile-logout mt-8" onClick={handleLogout}>
          <LogOut className="size-4 shrink-0" strokeWidth={2} />
          Выйти
        </button>
      </div>

      {portalReady &&
        avatarModalOpen &&
        createPortal(
          <div
            data-mobile-ui
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-photo-dialog-title"
            className="search-modal-backdrop fixed inset-0 z-1500 flex items-center justify-center p-4 transition-opacity duration-200"
            onClick={() => setAvatarModalOpen(false)}
          >
            <div
              className="glass-panel-strong w-full max-w-sm rounded-[1.75rem] p-6 shadow-(--lg-shadow-strong)"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 id="avatar-photo-dialog-title" className="text-lg font-semibold tracking-tight text-(--lg-text)">
                  Фото профиля
                </h2>
                <button
                  type="button"
                  className="btn-icon size-9 min-h-0 min-w-0 shrink-0"
                  onClick={() => setAvatarModalOpen(false)}
                  aria-label="Закрыть"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" className="btn-primary w-full py-3" onClick={handleReplacePhoto}>
                  Заменить фото
                </button>
                <button
                  type="button"
                  className="profile-logout w-full py-3"
                  onClick={async () => {
                    setAvatarModalOpen(false);
                    await handleAvatarRemove();
                  }}
                >
                  Удалить фото
                </button>
                <button type="button" className="btn-ghost w-full py-2.5" onClick={() => setAvatarModalOpen(false)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
