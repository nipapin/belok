import { after, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { cafeDay } from '@/lib/adminDashboard';
import { queryOne } from '@/lib/db';
import { weatherConnectionState, saveWeatherApiKey } from '@/lib/weatherSettings.server';
import { firstOrderDay, requestWeatherDay, syncArchive, syncForecast, WeatherAccessError } from '@/lib/weather.server';

export async function GET() {
  try {
    await requireAdmin('settings');
    const [connection, firstDay, recovered] = await Promise.all([weatherConnectionState(), firstOrderDay(), queryOne<{ days: number }>(`SELECT count(*)::int AS days FROM (SELECT (time AT TIME ZONE 'Europe/Kaliningrad')::date FROM weather_hours WHERE source='archive' GROUP BY 1 HAVING count(*)=13) x`)]);
    return NextResponse.json({ ...connection, firstDay, recoveredDays: recovered?.days ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message === 'UNAUTHORIZED' ? 'Нет доступа' : 'Не удалось загрузить настройки погоды' }, { status: (error as Error).message === 'UNAUTHORIZED' ? 403 : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin('settings');
    const body = await request.json();
    if (typeof body.apiKey !== 'string' || !/^[a-f0-9]{32}$/i.test(body.apiKey.trim())) return NextResponse.json({ error: 'Введите API-ключ OpenWeather: 32 символа' }, { status: 400 });
    const apiKey = body.apiKey.trim();
    try { await requestWeatherDay(cafeDay(new Date()), apiKey, 'forecast'); }
    catch (error) {
      if (!(error instanceof WeatherAccessError)) throw error;
      await saveWeatherApiKey(apiKey, true);
      return NextResponse.json({ configured: true, pending: true }, { status: 202 });
    }
    await saveWeatherApiKey(apiKey);
    after(async () => {
      try {
        await syncForecast();
        const first = await firstOrderDay(); if (first) await syncArchive(first, cafeDay(new Date()));
      } catch (error) { console.error('Weather recovery:', (error as Error).message); }
    });
    return NextResponse.json({ configured: true });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Нет доступа' : /OpenWeather|лимит|Ключ/.test(message) ? message : 'Не удалось сохранить ключ' }, { status: message === 'UNAUTHORIZED' ? 403 : 400 });
  }
}
