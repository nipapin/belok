/**
 * Номера из ADMIN_BYPASS_PHONES (через запятую) входят без SMS:
 * send-code создаёт код и отдаёт его в ответе для автоматической верификации.
 */

function normalizeRuPhone(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) return `+${d}`;
  if (d.length === 10) return `+7${d}`;
  return null;
}

function getAdminBypassPhoneSet(): Set<string> {
  const raw = process.env.ADMIN_BYPASS_PHONES ?? '';
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const n = normalizeRuPhone(part.trim());
    if (n) set.add(n);
  }
  return set;
}

export function isAdminBypassPhone(phone: string): boolean {
  const n = normalizeRuPhone(phone);
  if (!n || !/^\+7\d{10}$/.test(n)) return false;
  return getAdminBypassPhoneSet().has(n);
}
