'use client';

import { CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Sun, CircleHelp, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { fetchAdminJson } from '@/lib/adminDashboard';
import type { DayWeather as Weather, WeatherCondition } from '@/lib/weather';
import './sales-date-picker.css';

export type WeatherResponse = { days: Weather[]; firstDay: string | null; warning: string | null; configured: boolean };
export function useDayWeather(from: string, to = from) {
  return useQuery({ queryKey: ['admin-weather', from, to], queryFn: () => fetchAdminJson<WeatherResponse>(`/api/admin/weather?from=${from}&to=${to}`), staleTime: 15 * 60_000, refetchInterval: 60 * 60_000 });
}
const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
export function WeatherIcon({ condition, size = 21 }: { condition: WeatherCondition | null; size?: number }) {
  const icons = { sun: Sun, 'partly-cloudy': CloudSun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning, fog: CloudFog };
  const Icon = condition ? icons[condition] : CircleHelp;
  return <Icon size={size} aria-hidden="true" className={`weather-icon weather-${condition ?? 'unknown'}`} />;
}
export function WeekWeather({ weather }: { weather: Weather | undefined }) {
  const text = weather?.temperature === null || weather?.temperature === undefined ? '—' : `${weather.temperature > 0 ? '+' : ''}${Math.round(weather.temperature)} °C`;
  const labels = { sun: 'Ясно', 'partly-cloudy': 'Переменная облачность', cloud: 'Облачно', rain: 'Дождь', snow: 'Снег', storm: 'Гроза', fog: 'Туман' };
  return <span className="dashboard-day-weather" aria-label={weather?.condition ? `${labels[weather.condition]}, ${text}` : 'Погода ещё не загружена'} title={weather?.source === 'archive' ? 'Погода за 08:00–21:00' : 'Прогноз за 08:00–21:00'}>
    {weather?.condition ? <WeatherIcon condition={weather.condition} /> : <span className="weather-pending">—</span>}<span>{text}</span>
  </span>;
}
export function WeatherInline({ weather }: { weather: Weather | undefined }) {
  if (!weather?.source) return <span className="sales-weather-inline">Погода: ожидаем архив</span>;
  return <span className="sales-weather-inline"><WeatherIcon condition={weather.condition} size={15} /> {number(weather.temperature)} °C · {weather.precipitation === null ? '—' : `${number(weather.precipitation)} мм`}<br />{weather.source === 'archive' ? 'Архив' : 'Прогноз'} · 08:00–21:00</span>;
}
export function WeatherCredits() {
  return <div className="sales-weather-note"><p>Температура — среднее за 08:00–21:00, осадки — сумма за эти часы.</p><WeatherAttribution /></div>;
}
export function WeatherAttribution() {
  return <a className="weather-attribution" href="https://openweathermap.org/" target="_blank" rel="noreferrer"><Image src="/openweather-logo.png" width={84} height={24} alt="OpenWeather" /><span>Weather data provided by OpenWeather</span></a>;
}
export default function DayWeather({ day }: { day: string }) {
  const query = useDayWeather(day);
  const weather = query.data?.days?.[0];
  return <section className="dashboard-panel sales-weather-card" aria-label="Погода в Калининграде" aria-busy={query.isPending}>
    <div className="sales-weather-heading"><h2>Калининград · погода за день</h2><CloudSun size={24} aria-hidden="true" /></div>
    {query.isPending ? <p role="status">Загружаем погоду…</p> : query.isError ? <p role="status">Погода временно недоступна. <button className="sales-weather-retry" onClick={() => void query.refetch()}>Повторить <RefreshCw size={12} className="inline" /></button></p> : weather?.source ? <>
      <div className="sales-weather-metrics"><div><span>Температура</span><strong>{number(weather.temperature)} °C</strong></div><div><span>Осадки</span><strong>{weather.precipitation === null ? '—' : `${number(weather.precipitation)} мм`}</strong></div></div>
      <p className="sales-weather-note">{weather.source === 'archive' ? 'Архив погоды' : 'Прогноз'} · 08:00–21:00</p>
    </> : <p className="sales-weather-note">{query.data?.configured ? 'Погода за этот день ещё загружается.' : 'Добавьте ключ OpenWeather в настройках, чтобы подключить погоду.'}</p>}
    {query.data?.warning && <p className="sales-weather-note" role="status">{query.data.warning}</p>}
    <WeatherCredits />
  </section>;
}
