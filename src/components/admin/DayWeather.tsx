'use client';

import { CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Sun, CircleHelp, RefreshCw, Droplets } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { fetchAdminJson } from '@/lib/adminDashboard';
import type { DayWeather as Weather, WeatherCondition } from '@/lib/weather';
import './sales-date-picker.css';
import './day-weather.css';

export type WeatherResponse = { days: Weather[]; firstDay: string | null; warning: string | null; configured: boolean };
export function useDayWeather(from: string, to = from) {
  return useQuery({ queryKey: ['admin-weather', from, to], queryFn: () => fetchAdminJson<WeatherResponse>(`/api/admin/weather?from=${from}&to=${to}`), staleTime: 15 * 60_000, refetchInterval: 60 * 60_000 });
}
const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const conditionLabels: Record<WeatherCondition, string> = { sun: 'Ясно', 'partly-cloudy': 'Переменная облачность', cloud: 'Облачно', rain: 'Дождь', snow: 'Снег', storm: 'Гроза', fog: 'Туман' };
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
  if (!weather?.source || weather.temperature === null) return <span className="sales-weather-inline">Нет данных о погоде за этот день</span>;
  return <span className="sales-weather-inline"><WeatherIcon condition={weather.condition} size={15} /> {number(weather.temperature)} °C · {weather.precipitation === null ? 'осадки: нет данных' : `${number(weather.precipitation)} мм`}<br />{weather.source === 'archive' ? 'Архив' : 'Прогноз'} · {weather.complete ? '08:00–21:00' : `${weather.hours} из 13 часов`}</span>;
}
export function WeatherCredits({ weather }: { weather: Weather | undefined }) {
  if (!weather?.source || weather.temperature === null) return null;
  return <div className="sales-weather-note"><WeatherAttribution /></div>;
}
export function WeatherAttribution({ logoOnly = false }: { logoOnly?: boolean }) {
  return <a className={`weather-attribution${logoOnly ? ' weather-attribution-logo-only' : ''}`} href="https://openweathermap.org/" target="_blank" rel="noreferrer" aria-label="Weather data provided by OpenWeather"><span className="weather-attribution-logo"><Image src="/openweather-logo.png" width={600} height={340} alt="OpenWeather" /></span>{!logoOnly && <span>Weather data provided by OpenWeather</span>}</a>;
}
export default function DayWeather({ day }: { day: string }) {
  const query = useDayWeather(day);
  const weather = query.data?.days?.[0];
  const condition = weather?.condition ?? null;
  const scene = condition === 'sun' ? 'clear' : condition === 'snow' ? 'snow' : condition === 'rain' || condition === 'storm' ? 'rain' : 'clouds';
  const ready = Boolean(weather?.source && weather.temperature !== null);
  return <section className={`day-weather-card day-weather-${condition ?? 'unknown'}`} aria-label="Погода в Калининграде" aria-busy={query.isPending}>
    {ready && <Image className="day-weather-background" src={`/weather/${scene}.webp`} alt="" fill sizes="(max-width: 700px) 100vw, 85vw" loading="eager" />}
    <div className="day-weather-shade" aria-hidden="true" />
    <div className="day-weather-content">
      <header className="day-weather-header"><h2>Калининград</h2><span>{weather?.source === 'archive' ? 'Погода за день' : 'Прогноз на день'} · 08:00–21:00{ready && !weather!.complete && ` · ${weather!.hours} из 13 часов`}</span></header>
      {query.isPending ? <p className="day-weather-status" role="status">Загружаем погоду…</p> : query.isError && !weather ? <p className="day-weather-status" role="status">Погода временно недоступна. <button onClick={() => void query.refetch()}>Повторить <RefreshCw size={12} className="inline" /></button></p> : ready ? <>
        <div className="day-weather-temperature"><WeatherIcon condition={condition} size={52} /><strong>{number(weather!.temperature)}<span>°C</span></strong></div>
        <p className="day-weather-condition">{condition ? conditionLabels[condition] : 'Погода за рабочие часы'}</p>
        <div className="day-weather-precipitation"><Droplets size={17} aria-hidden="true" /><span>Осадки</span><strong>{weather!.precipitation === null ? '—' : `${number(weather!.precipitation)} мм`}</strong></div>
      </> : <p className="day-weather-status">{query.data?.configured ? 'Погода за этот день ещё загружается.' : 'Подключите OpenWeather в настройках, чтобы показать погоду.'}</p>}
      {query.data?.warning && <p className="day-weather-warning" role="status">{query.data.warning}</p>}
    </div>
    {ready && <div className="day-weather-provider"><WeatherAttribution logoOnly /></div>}
  </section>;
}
