'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
        <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Настройки сохранены
        </div>
      )}

      <div className="admin-table-wrap mb-6 overflow-x-auto">
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

      <button
        type="button"
        className="btn-primary gap-2 py-2.5 text-sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        <Save className="size-4" />
        Сохранить настройки
      </button>

      <div className="glass-panel mt-8 p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Правила программы</h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-zinc-600">
          <li>Бонусами можно оплатить до 30% стоимости заказа.</li>
          <li>1 бонус равен 1 ₽.</li>
          <li>Кэшбэк начисляется после успешной оплаты.</li>
          <li>Уровень лояльности повышается при достижении суммы покупок.</li>
        </ul>
      </div>
    </div>
  );
}
