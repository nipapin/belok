import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { cafeDay } from '@/lib/adminDashboard';
import { validDay } from '@/lib/revenueStats';
import { firstOrderDay, readWeather, syncForecast } from '@/lib/weather.server';
import { weatherApiKey } from '@/lib/weatherSettings.server';

export async function GET(request: Request) {
  try {
    await requireAdmin('reports');
    const params = new URL(request.url).searchParams;
    const today = cafeDay(new Date());
    const from = params.get('from') ?? today;
    const to = params.get('to') ?? from;
    if (!validDay(from) || !validDay(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 730) {
      return NextResponse.json({ error: 'Укажите период не более двух лет' }, { status: 400 });
    }
    let warning: string | null = null;
    const configured = Boolean(await weatherApiKey());
    if (to >= today) {
      try { await syncForecast(); } catch { warning = 'Не удалось обновить прогноз. Показаны сохранённые данные.'; }
    }
    const [days, firstDay] = await Promise.all([readWeather(from, to), firstOrderDay()]);
    return NextResponse.json({ days, firstDay, warning, configured }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
    console.error('Weather API failed:', error);
    return NextResponse.json({ error: 'Не удалось загрузить погоду' }, { status: 503 });
  }
}
