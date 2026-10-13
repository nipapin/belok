import { cafeDay } from './adminDashboard';
import { revenueDays } from './revenueStats';

export type WeatherSource = 'forecast' | 'archive';
export type WeatherCondition = 'sun' | 'partly-cloudy' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';
export type WeatherHour = { time: string; temperature: number; precipitation: number; condition: WeatherCondition | null; source: WeatherSource };
export type DayWeather = { day: string; temperature: number | null; precipitation: number | null; condition: WeatherCondition | null;
  source: WeatherSource | null; hours: number; complete: boolean };

export function weatherCondition(code: number): WeatherCondition | null {
  if (code >= 200 && code < 300) return 'storm';
  if (code >= 300 && code < 600) return 'rain';
  if (code >= 600 && code < 700) return 'snow';
  if (code >= 700 && code < 800) return 'fog';
  if (code === 800) return 'sun';
  if (code === 801 || code === 802) return 'partly-cloudy';
  if (code === 803 || code === 804) return 'cloud';
  return null;
}
const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kaliningrad', hour: '2-digit', hourCycle: 'h23' });
const round = (value: number) => Math.round(value * 10) / 10;
export function summarizeWeather(hours: WeatherHour[], from: string, to: string): DayWeather[] {
  const grouped = new Map<string, WeatherHour[]>();
  for (const row of hours) {
    const day = cafeDay(row.time); const hour = Number(hourFormatter.format(new Date(row.time)));
    if (hour < 8 || hour >= 21 || day < from || day > to) continue;
    const bucket = grouped.get(day) ?? []; bucket.push(row); grouped.set(day, bucket);
  }
  return revenueDays(from, to).map(day => {
    const bucket = grouped.get(day) ?? [];
    const archive = bucket.filter(row => row.source === 'archive');
    const forecast = bucket.filter(row => row.source === 'forecast');
    const selected = archive.length === 13 ? archive : forecast.length === 13 ? forecast : archive.length ? archive : forecast;
    const counts = new Map<WeatherCondition, number>();
    for (const row of selected) if (row.condition) counts.set(row.condition, (counts.get(row.condition) ?? 0) + 1);
    const condition = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const complete = selected.length === 13;
    return { day, source: selected[0]?.source ?? null, hours: selected.length, complete, condition,
      temperature: complete || selected[0]?.source === 'archive' ? round(selected.reduce((sum, row) => sum + row.temperature, 0) / selected.length) : null,
      precipitation: complete ? round(selected.reduce((sum, row) => sum + row.precipitation, 0)) : null };
  });
}

export function parseOpenWeather(payload: unknown, source: WeatherSource): WeatherHour[] {
  const data = payload as { data?: { dt: number; temp: number; rain?: { '1h'?: number }; snow?: { '1h'?: number }; weather?: { id: number }[] }[] };
  if (!Array.isArray(data?.data) || !data.data.length) throw Error('Некорректный ответ OpenWeather');
  return data.data.flatMap(row => {
    if (!Number.isFinite(row.dt) || !Number.isFinite(row.temp)) return [];
    const precipitation = (row.rain?.['1h'] ?? 0) + (row.snow?.['1h'] ?? 0);
    if (!Number.isFinite(precipitation) || precipitation < 0) return [];
    return [{ time: new Date(row.dt * 1000).toISOString(), source, temperature: row.temp, precipitation,
      condition: weatherCondition(row.weather?.[0]?.id ?? -1) }];
  });
}

export function clampSalesPeriod(from: string, to: string, firstDay: string, today: string) {
  const start = from < firstDay ? firstDay : from > today ? today : from;
  const end = to < start ? start : to > today ? today : to;
  return { from: start, to: end };
}
