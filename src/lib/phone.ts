/** Пустой ввод или только код страны — номера нет. Иначе +7 и 10 цифр. */
export function normalizeRuPhone(input: string): { ok: true; phone: string | null } | { ok: false } {
  const digits = input.replace(/\D/g, '');
  if (!digits || digits === '7' || digits === '8') return { ok: true, phone: null };

  let national = digits;
  if (national.length === 11 && (national.startsWith('7') || national.startsWith('8'))) {
    national = national.slice(1);
  }
  if (national.length !== 10) return { ok: false };
  return { ok: true, phone: `+7${national}` };
}

/** Маска поля +7 (000) 000-00-00. Пустая строка, если номер не разобрать. */
export function formatRuPhoneMask(input: string): string {
  const parsed = normalizeRuPhone(input);
  if (!parsed.ok || !parsed.phone) return '';
  const national = parsed.phone.slice(2);
  return `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8, 10)}`;
}
