export async function updateAdminOrderStatus<T>(id: string, status: string): Promise<{ order: T; notice?: string }> {
  const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Не удалось изменить статус. Обновите список и попробуйте ещё раз.'
    );
  }
  if (!data?.order) throw new Error('Сервер не подтвердил изменение статуса. Обновите список.');
  return data;
}
