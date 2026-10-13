import RevenuePage from '@/components/admin/RevenuePage';
import { cafeDay } from '@/lib/adminDashboard';
import { validDay } from '@/lib/revenueStats';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const today = cafeDay(new Date());
  const from = typeof params.from === 'string' && validDay(params.from) ? params.from : today;
  const to = typeof params.to === 'string' && validDay(params.to) ? params.to : from;
  return <RevenuePage key={`${from}:${to}`} initialFrom={from} initialTo={to} />;
}
