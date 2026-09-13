export const ORDER_STATUS_LABELS: Record<string, { label: string; chip: string }> = {
  PENDING: { label: 'Ожидает', chip: 'admin-chip-neutral' },
  CONFIRMED: { label: 'Подтверждён', chip: 'bg-sky-100 text-sky-800' },
  PREPARING: { label: 'Готовится', chip: 'bg-amber-100 text-amber-900' },
  READY: { label: 'Готов', chip: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Выполнен', chip: 'bg-emerald-100 text-emerald-900' },
  CANCELLED: { label: 'Отменён', chip: 'bg-rose-100 text-rose-800' },
};

export interface OrderCustomizationView {
  action: 'ADD' | 'REMOVE';
  priceDelta: number;
  ingredient: { id: string; name: string; price: number } | null;
}

export interface OrderItemView {
  product: { name: string } | null;
  quantity: number;
  unitPrice: number;
  customizations: OrderCustomizationView[];
}

export function OrderItemsList({ items }: { items: OrderItemView[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-(--lg-text-muted)">Пустой заказ</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const adds = item.customizations.filter((c) => c.action === 'ADD');
        const removes = item.customizations.filter((c) => c.action === 'REMOVE');
        return (
          <div key={i} className="text-xs leading-relaxed text-(--lg-text-muted)">
            <span className="font-medium text-(--lg-text)">
              {item.product?.name ?? 'Товар'} ×{item.quantity}
            </span>
            <span className="ml-1 tabular-nums">· {item.unitPrice} ₽</span>
            {adds.map((c, j) => (
              <span key={`a-${j}`} className="mt-0.5 block text-emerald-700">
                + {c.ingredient?.name ?? 'добавка'}
                {c.priceDelta > 0 ? ` (+${c.priceDelta} ₽)` : ''}
              </span>
            ))}
            {removes.map((c, j) => (
              <span key={`r-${j}`} className="mt-0.5 block text-rose-700">
                − {c.ingredient?.name ?? 'ингредиент'}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
