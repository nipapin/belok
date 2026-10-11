export const paymentLabels: Record<string, string> = { CARD: 'Карта', CASH: 'Наличные', SBP: 'СБП', BONUS: 'Бонусы' };
export type ReportRow = {
  id: string; orderId: string; dailyNumber: number | null; createdAt: string;
  productName: string; variantName: string | null; quantity: number;
  unitPrice: number; orderTotal: number; paymentMethod: string | null;
  paymentStatus: string; status: string; comment: string | null;
};
export type ManagerReport = {
  rows: ReportRow[]; page: number; count: number;
  summary: { orders: number; quantity: number; total: number; paid: number;
    cashTotal: number; cashPaid: number; nonCashTotal: number; nonCashPaid: number; otherTotal: number; otherPaid: number };
};

export function reportPeriod(from: string, to: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to) throw Error('Некорректный период');
  // Calendar dates refer to Kaliningrad (UTC+2), not the browser or DB timezone.
  const start = new Date(`${from}T00:00:00+02:00`);
  const end = new Date(`${to}T00:00:00+02:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function reportCsv(rows: ReportRow[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    // Prevent spreadsheet formula execution in names and comments.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Kaliningrad', dateStyle: 'short', timeStyle: 'medium' });
  const lines = rows.map(r => [r.orderId, r.dailyNumber, date.format(new Date(r.createdAt)), r.productName,
    r.variantName, r.quantity, r.unitPrice, Number(r.unitPrice) * r.quantity, r.orderTotal,
    paymentLabels[r.paymentMethod ?? ''] ?? r.paymentMethod ?? 'Не указан', r.paymentStatus, r.status, r.comment]);
  return '\uFEFF' + [['ID заказа', 'Номер', 'Дата и время (Калининград)', 'Блюдо', 'Вариант', 'Количество', 'Цена', 'Сумма позиции', 'Сумма заказа', 'Тип оплаты', 'Статус оплаты', 'Статус заказа', 'Комментарий'], ...lines]
    .map(line => line.map(cell).join(';')).join('\r\n');
}
