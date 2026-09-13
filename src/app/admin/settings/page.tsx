'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function KioskPinSettings() {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ['admin-kiosk'],
    queryFn: () => fetch('/api/admin/kiosk').then((r) => r.json()) as Promise<{ configured?: boolean }>,
  });

  const savePin = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/kiosk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = (await res.json()) as { error?: string; configured?: boolean };
      if (!res.ok) throw new Error(json.error || 'Ошибка сохранения');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kiosk'] });
      setPin('');
    },
  });

  return (
    <div className="glass-panel mt-8 space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-(--lg-text)">Терминал у кассы</h2>
        <p className="mt-1 text-sm text-(--lg-text-muted)">
          Откройте эту ссылку на планшете и введите PIN один раз. Гости увидят меню без
          оболочки приложения.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-xl bg-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] px-3 py-2 text-sm text-(--lg-text)">
          /kiosk
        </code>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-sm"
          onClick={() => {
            const url = `${window.location.origin}/kiosk`;
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <p className="text-sm text-(--lg-text-muted)">
        {data?.configured ? 'PIN задан. Новый код заменит текущий и сбросит доступ на планшете.' : 'PIN ещё не задан — терминал не откроется.'}
      </p>
      <label className="block text-sm font-medium text-(--lg-text)">
        PIN (4–6 цифр)
        <input
          className="input-pill mt-1 max-w-[200px] py-2 text-sm tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={data?.configured ? '••••' : '1234'}
        />
      </label>
      {savePin.isError ? (
        <p className="text-sm text-red-600">
          {savePin.error instanceof Error ? savePin.error.message : 'Ошибка сохранения'}
        </p>
      ) : null}
      {savePin.isSuccess ? (
        <p className="text-sm text-emerald-700">PIN сохранён</p>
      ) : null}
      <button
        type="button"
        className="btn-primary gap-2 py-2.5 text-sm"
        disabled={pin.length < 4 || savePin.isPending}
        onClick={() => savePin.mutate()}
      >
        <Save className="size-4" />
        Сохранить PIN
      </button>
    </div>
  );
}

interface LoyaltyLevel {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discountPercent: number;
  _count?: { users: number };
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => fetch('/api/admin/settings').then((r) => r.json()),
  });

  const [dirtyLevels, setDirtyLevels] = useState<LoyaltyLevel[] | null>(null);
  const levels: LoyaltyLevel[] = dirtyLevels ?? (data?.levels as LoyaltyLevel[] | undefined) ?? [];
  const setLevels = (next: LoyaltyLevel[]) => setDirtyLevels(next);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setDirtyLevels(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const updateLevel = (index: number, field: keyof LoyaltyLevel, value: string) => {
    setLevels(
      levels.map((l: LoyaltyLevel, i: number) =>
        i === index ? { ...l, [field]: value } : l
      )
    );
  };

  return (
    <div>
      <h1 className="heading-section mb-6">Настройки бонусной программы</h1>

      {saved && (
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-2 py-3 text-sm text-emerald-900">
          Настройки сохранены
        </div>
      )}

      <div className="mb-6 hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[720px]">
            <thead>
              <tr>
                <th>Уровень</th>
                <th>Мин. сумма, ₽</th>
                <th>Кэшбэк, %</th>
                <th>Скидка, %</th>
                <th>Клиентов</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level, i) => (
                <tr key={level.id}>
                  <td>
                    <input
                      className="input-pill max-w-[180px] py-2 text-sm"
                      value={level.name}
                      onChange={(e) => updateLevel(i, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input-pill max-w-[120px] py-2 text-sm"
                      type="number"
                      value={level.minSpent}
                      onChange={(e) => updateLevel(i, 'minSpent', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input-pill max-w-[100px] py-2 text-sm"
                      type="number"
                      value={level.cashbackPercent}
                      onChange={(e) => updateLevel(i, 'cashbackPercent', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input-pill max-w-[100px] py-2 text-sm"
                      type="number"
                      value={level.discountPercent}
                      onChange={(e) => updateLevel(i, 'discountPercent', e.target.value)}
                    />
                  </td>
                  <td>{level._count?.users ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 space-y-3 min-[900px]:hidden">
        {levels.map((level, i) => (
          <div key={level.id} className="glass-panel space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-(--lg-text-muted)">
              Уровень {i + 1}
            </p>
            <label className="block text-sm font-medium text-(--lg-text)">
              Название
              <input
                className="input-pill mt-1 py-2 text-sm"
                value={level.name}
                onChange={(e) => updateLevel(i, 'name', e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-(--lg-text)">
              Мин. сумма, ₽
              <input
                className="input-pill mt-1 py-2 text-sm"
                type="number"
                value={level.minSpent}
                onChange={(e) => updateLevel(i, 'minSpent', e.target.value)}
              />
            </label>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--lg-text)_12%,transparent)] px-3 py-2.5 text-sm">
              <span className="text-(--lg-text-muted)">Клиентов</span>
              <span className="font-semibold tabular-nums text-(--lg-text)">{level._count?.users ?? 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-(--lg-text)">
                Кэшбэк, %
                <input
                  className="input-pill mt-1 py-2 text-sm"
                  type="number"
                  value={level.cashbackPercent}
                  onChange={(e) => updateLevel(i, 'cashbackPercent', e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-(--lg-text)">
                Скидка, %
                <input
                  className="input-pill mt-1 py-2 text-sm"
                  type="number"
                  value={level.discountPercent}
                  onChange={(e) => updateLevel(i, 'discountPercent', e.target.value)}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-primary gap-2 py-2.5 text-sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        <Save className="size-4" />
        Сохранить настройки
      </button>

      <KioskPinSettings />

      <div className="glass-panel mt-8 p-5">
        <h2 className="mb-3 text-base font-semibold text-(--lg-text)">Правила программы</h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-(--lg-text-muted)">
          <li>Бонусами можно оплатить до 100% стоимости заказа.</li>
          <li>1 бонус равен 1 ₽.</li>
          <li>Кэшбэк начисляется после выполнения заказа.</li>
          <li>Уровень лояльности повышается при достижении суммы покупок.</li>
        </ul>
      </div>
    </div>
  );
}
