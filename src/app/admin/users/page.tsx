'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';

interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevel: { id: string; name: string } | null;
  _count: { orders: number };
  createdAt: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [bonusAdjustment, setBonusAdjustment] = useState('');
  const [bonusReason, setBonusReason] = useState('');

  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
  });
  const users: User[] = data?.users ?? [];

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/users/${editUser?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
    },
  });

  return (
    <div>
      <h1 className="heading-section mb-6">Пользователи</h1>

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[960px]">
          <thead>
            <tr>
              <th>Телефон</th>
              <th>Имя</th>
              <th>Роль</th>
              <th>Уровень</th>
              <th>Бонусы</th>
              <th>Потрачено</th>
              <th>Заказы</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.phone}</td>
                <td>{user.name || '—'}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      user.role === 'ADMIN' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {user.role === 'ADMIN' ? 'Админ' : 'Клиент'}
                  </span>
                </td>
                <td>{user.loyaltyLevel?.name || '—'}</td>
                <td>{user.bonusBalance}</td>
                <td>{user.totalSpent} ₽</td>
                <td>{user._count.orders}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-icon inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-zinc-100"
                    onClick={() => {
                      setEditUser(user);
                      setBonusAdjustment('');
                      setBonusReason('');
                    }}
                    aria-label="Изменить"
                  >
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Редактировать пользователя"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditUser(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-sm"
              onClick={() => {
                const body: Record<string, unknown> = { role: editUser?.role };
                if (bonusAdjustment) {
                  const adj = parseFloat(bonusAdjustment);
                  body.bonusBalance = (editUser?.bonusBalance || 0) + adj;
                  body.bonusAdjustment = adj;
                  body.bonusReason = bonusReason;
                }
                updateMutation.mutate(body);
              }}
            >
              Сохранить
            </button>
          </>
        }
      >
        {editUser && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-600">
              Телефон: <span className="font-medium text-zinc-900">{editUser.phone}</span>
            </p>
            <label className="text-sm font-medium text-zinc-700">
              Роль
              <select
                className="input-pill mt-1 cursor-pointer"
                value={editUser.role}
                onChange={(e) =>
                  setEditUser(editUser ? { ...editUser, role: e.target.value } : null)
                }
              >
                <option value="USER">Клиент</option>
                <option value="ADMIN">Администратор</option>
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Корректировка бонусов (+/−)
              <input
                className="input-pill mt-1"
                type="number"
                value={bonusAdjustment}
                onChange={(e) => setBonusAdjustment(e.target.value)}
              />
            </label>
            <p className="text-xs text-zinc-500">Текущий баланс: {editUser.bonusBalance}</p>
            {bonusAdjustment ? (
              <label className="text-sm font-medium text-zinc-700">
                Причина
                <input
                  className="input-pill mt-1"
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                />
              </label>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
