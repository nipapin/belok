'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Switch from '@/components/ui/Switch';
import PushToggle from '@/components/notifications/PushToggle';
import type { NotificationSettings } from '@/lib/notificationSettings';

const ROWS: { key: keyof NotificationSettings; title: string; hint: string }[] = [
  {
    key: 'adminNewOrdersPush',
    title: 'Push админу о новом заказе',
    hint: 'Отправим системное уведомление всем администраторам с включённым push.',
  },
  {
    key: 'adminNewOrdersSound',
    title: 'Звук и тост в админке',
    hint: 'Если панель открыта в браузере — короткий сигнал и всплывающее сообщение.',
  },
  {
    key: 'autoPushOrderStatus',
    title: 'Статус заказа клиенту',
    hint: 'Клиент получит push, когда заказ подтвердят, начнут готовить, соберут или отменят.',
  },
  {
    key: 'autoPushLoyalty',
    title: 'Бонусы и уровень лояльности',
    hint: 'Кэшбэк, списание бонусов и повышение уровня.',
  },
  {
    key: 'autoPushWelcome',
    title: 'Приветствие при включении push',
    hint: 'Короткое сообщение сразу после подписки на уведомления.',
  },
];

export default function AdminNotificationSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-notification-settings'],
    queryFn: () => fetch('/api/admin/notification-settings').then((r) => r.json()),
  });
  const settings = data?.settings as NotificationSettings | undefined;

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<NotificationSettings>) => {
      if (!settings) return;
      const res = await fetch('/api/admin/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...patch }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(['admin-notification-settings'], payload);
    },
  });

  return (
    <div className="glass-panel space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-(--lg-text)">Показ уведомлений</h2>
        <p className="mt-1 text-sm text-(--lg-text-muted)">
          Что приходит администратору и какие автоматические push уходят гостям.
        </p>
      </div>

      {isLoading || !settings ? (
        <div className="h-40 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]" />
      ) : (
        <div className="divide-y divide-[color-mix(in_srgb,var(--lg-text)_8%,transparent)]">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-(--lg-text)">{row.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-(--lg-text-muted)">{row.hint}</p>
              </div>
              <Switch
                id={`notify-${row.key}`}
                checked={settings[row.key]}
                onChange={(next) => saveMutation.mutate({ [row.key]: next })}
                disabled={saveMutation.isPending}
                aria-label={row.title}
              />
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-4">
        <PushToggle
          embedded
          title="Push на это устройство"
          description="Включите, чтобы получать уведомления о новых заказах в этом браузере."
          switchId="admin-push-toggle"
        />
      </div>
    </div>
  );
}
