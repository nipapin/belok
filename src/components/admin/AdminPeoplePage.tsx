'use client';

import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffRoles, effectiveRoles, displayRoles, roleLabels, hasPermission, canAssignRoles } from '@/lib/roles';
import { useAuthStore } from '@/store/authStore';
import Modal from '@/components/ui/Modal';

interface User {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: string;
  staffRoles?: string[] | null;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevel: { id: string; name: string } | null;
  _count: { orders: number };
  createdAt: string;
}

const roleLabel = (role: string) => roleLabels[role] ?? role;

export default function AdminPeoplePage({ scope }: { scope: 'users' | 'employees' }) {
  const actor = useAuthStore(s => s.user);
  const employees = scope === 'employees';
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [bonusAdjustment, setBonusAdjustment] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [levelFilter, setLevelFilter] = useState('ALL');

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-users', scope],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users?scope=${scope}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? 'Не удалось загрузить список');
      return data as { users: User[] };
    },
  });
  const roles = [...new Set((data?.users ?? []).flatMap(user => [...effectiveRoles(user)]))];

  const { data: settingsData } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => fetch('/api/admin/settings').then((r) => r.json()),
  });
  const levels: { id: string; name: string }[] = settingsData?.levels ?? [];

  const filteredUsers = useMemo(() => {
    const list: User[] = data?.users ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((user) => {
      if (employees ? effectiveRoles(user).every(role => role === 'USER') : effectiveRoles(user).some(role => role !== 'USER')) return false;
      if (roleFilter !== 'ALL' && !effectiveRoles(user).includes(roleFilter)) return false;
      if (levelFilter !== 'ALL' && user.loyaltyLevel?.id !== levelFilter) return false;
      if (!q) return true;
      const name = (user.name ?? '').toLowerCase();
      const email = (user.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || (user.phone ?? '').includes(q);
    });
  }, [data, search, roleFilter, levelFilter, employees]);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/users/${editUser?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? 'Не удалось сохранить изменения'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditUser(null);
    },
  });

  return (
    <div>
      <h1 className="heading-section mb-2">{employees ? 'Сотрудники' : 'Пользователи'}</h1>
      <p className="mb-6 text-sm text-(--lg-text-muted)">{employees ? 'Рабочие роли и доступ сотрудников.' : 'Клиенты кафе. Здесь можно назначить сотруднику рабочие роли.'}</p>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          className="input-pill w-full py-2.5 text-sm"
          type="search"
          placeholder="Имя, email или телефон"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {employees && <select
          className="select-pill py-2.5 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Роль"
        >
          <option value="ALL">Все роли</option>
          {roles.filter(role => role !== 'USER').map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
        </select>}
        <select
          className="select-pill py-2.5 text-sm"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          aria-label="Уровень лояльности"
        >
          <option value="ALL">Все уровни</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>
      </div>

      {isPending && <p role="status" className="mb-4">Загружаем список…</p>}
      {isError && <p role="alert" className="mb-4 text-rose-700">Не удалось загрузить список. <button type="button" className="underline" onClick={() => void refetch()}>Повторить</button></p>}
      {!isPending && !isError && filteredUsers.length === 0 ? (
        <p className="mb-4 text-sm text-(--lg-text-muted)">Никого не нашли по этим фильтрам</p>
      ) : null}

      <div className="hidden min-[900px]:block">
        <div className="admin-table-wrap overflow-x-auto">
          <table className="admin-table min-w-[960px]">
            <thead>
              <tr>
                <th>Email / Телефон</th>
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
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.email || user.phone || '—'}</td>
                  <td>{user.name || '—'}</td>
                  <td>
                    <span
                      className={
                        hasPermission(user, 'settings')
                          ? 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800'
                          : 'admin-chip-neutral'
                      }
                    >
                      {displayRoles(user)}
                    </span>
                  </td>
                  <td>{user.loyaltyLevel?.name || '—'}</td>
                  <td>{user.bonusBalance}</td>
                  <td>{user.totalSpent} ₽</td>
                  <td>{user._count.orders}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-icon inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                      onClick={() => {
                        setEditUser(user);
                        setBonusAdjustment('');
                        setBonusReason('');
                      }}
                      disabled={!actor || !canAssignRoles(actor, user, user.staffRoles ?? null)}
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
      </div>

      <div className="space-y-3 min-[900px]:hidden">
        {filteredUsers.map((user) => (
          <div key={user.id} className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-(--lg-text)">{user.email || user.phone || '—'}</p>
                <p className="mt-0.5 text-sm text-(--lg-text-muted)">{user.name || '—'}</p>
              </div>
              <button
                type="button"
                className="btn-icon shrink-0 inline-flex size-9 border-0 bg-transparent shadow-none hover:bg-[color-mix(in_srgb,var(--lg-text)_6%,transparent)]"
                onClick={() => {
                  setEditUser(user);
                  setBonusAdjustment('');
                  setBonusReason('');
                }}
                disabled={!actor || !canAssignRoles(actor, user, user.staffRoles ?? null)}
                aria-label="Изменить"
              >
                <Pencil className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={
                  hasPermission(user, 'settings')
                    ? 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800'
                    : 'admin-chip-neutral'
                }
              >
                {displayRoles(user)}
              </span>
              {user.loyaltyLevel?.name ? (
                <span className="admin-chip-neutral text-xs font-medium">{user.loyaltyLevel.name}</span>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-[color-mix(in_srgb,var(--lg-text)_8%,transparent)] pt-3 text-center text-xs">
              <div>
                <dt className="text-(--lg-text-muted)">Бонусы</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-(--lg-text)">{user.bonusBalance}</dd>
              </div>
              <div>
                <dt className="text-(--lg-text-muted)">Потрачено</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-(--lg-text)">{user.totalSpent} ₽</dd>
              </div>
              <div>
                <dt className="text-(--lg-text-muted)">Заказы</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-(--lg-text)">{user._count.orders}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={employees ? 'Редактировать сотрудника' : 'Редактировать пользователя'}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditUser(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-sm"
              disabled={updateMutation.isPending}
              onClick={() => {
                const original = data?.users.find(user => user.id === editUser?.id);
                const body: Record<string, unknown> = {};
                if (JSON.stringify(original?.staffRoles ?? null) !== JSON.stringify(editUser?.staffRoles ?? null)) body.staffRoles = editUser?.staffRoles ?? null;
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
            {updateMutation.isError && <p role="alert" className="text-sm text-rose-700">{updateMutation.error.message}</p>}
            <p className="text-sm text-(--lg-text-muted)">
              Email: <span className="font-medium text-(--lg-text)">{editUser.email || '—'}</span>
              {editUser.phone ? (
                <>
                  {' · '}Телефон: <span className="font-medium text-(--lg-text)">{editUser.phone}</span>
                </>
              ) : null}
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Роли и доступ</legend>
              <p className="text-xs text-(--lg-text-muted)">Исходная роль: {roleLabel(editUser.role)}. Она сохраняется; выбранные рабочие роли определяют доступ.</p>
              {hasPermission(actor, 'settings') && <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editUser.staffRoles == null} onChange={e => setEditUser({...editUser, staffRoles: e.target.checked ? null : ['USER']})} />
                Сохранить исходный доступ
              </label>}
              {staffRoles.filter(role => hasPermission(actor, 'settings') || !['OWNER','MANAGER'].includes(role)).map(role => <label key={role} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editUser.staffRoles?.includes(role) ?? false} onChange={e => {
                  const current = editUser.staffRoles ?? [];
                  const next = e.target.checked ? role === 'USER' ? ['USER'] : [...current.filter(r => r !== 'USER'), role] : current.filter(r => r !== role);
                  setEditUser({...editUser, staffRoles: next.length ? next : ['USER']});
                }} />{roleLabel(role)}
              </label>)}
              <p className="text-xs text-(--lg-text-muted)">Рабочие роли можно совмещать. «Клиент» снимает рабочий доступ. Чтобы ограничить текущего администратора, выберите для него роль повара или другого сотрудника.</p>
            </fieldset>
            <label className="text-sm font-medium text-(--lg-text)">
              Корректировка бонусов (+/−)
              <input
                className="input-pill mt-1"
                type="number"
                value={bonusAdjustment}
                onChange={(e) => setBonusAdjustment(e.target.value)}
              />
            </label>
            <p className="text-xs text-(--lg-text-muted)">Текущий баланс: {editUser.bonusBalance}</p>
            {bonusAdjustment ? (
              <label className="text-sm font-medium text-(--lg-text)">
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
