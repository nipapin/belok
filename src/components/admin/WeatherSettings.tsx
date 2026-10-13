'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAdminJson } from '@/lib/adminDashboard';

export default function WeatherSettings() {
  const [apiKey, setApiKey] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['weather-settings'], queryFn: () => fetchAdminJson<{ configured: boolean; recoveredDays: number; firstDay: string | null }>('/api/admin/weather/settings'), refetchInterval: 30_000 });
  const save = useMutation({ mutationFn: async () => {
    const response = await fetch('/api/admin/weather/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error ?? 'Не удалось подключить погоду');
  }, onSuccess: () => { setApiKey(''); void client.invalidateQueries({ queryKey: ['weather-settings'] }); void client.invalidateQueries({ queryKey: ['admin-weather'] }); } });
  return <section className="glass-panel mt-8 space-y-4 p-5" aria-labelledby="weather-settings-title">
    <h2 id="weather-settings-title" className="text-base font-semibold text-(--lg-text)">Погода · Калининград</h2>
    <p className="text-sm text-(--lg-text-muted)">OpenWeather показывает прогноз и восстанавливает историю с первого заказа. Температура — среднее за 08:00–21:00; осадки — сумма за эти часы.</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-(--lg-text-muted)"><li>Создайте ключ в <a className="underline" href="https://home.openweathermap.org/api_keys" target="_blank" rel="noreferrer">OpenWeather</a> и подключите <a className="underline" href="https://openweathermap.org/api/one-call-4" target="_blank" rel="noreferrer">One Call 4.0</a>.</li><li>В Billing plans поставьте лимит 1000 запросов в день: это бесплатный объём.</li><li>Вставьте ключ ниже. Восстановление истории запустится автоматически.</li></ol>
    <p className="text-sm">{query.isPending ? 'Проверяем подключение…' : query.data?.configured ? `Подключено · восстановлено дней: ${query.data.recoveredDays}` : 'Ключ ещё не добавлен'}</p>
    {query.isError && <p role="alert" className="text-sm text-red-700">Не удалось загрузить настройки. <button className="underline" onClick={() => void query.refetch()}>Повторить</button></p>}
    <form onSubmit={event => { event.preventDefault(); save.mutate(); }} className="space-y-3">
      <label className="block text-sm font-medium">API-ключ<input className="input-pill mt-2 w-full max-w-md" type="password" autoComplete="off" maxLength={32} value={apiKey} onChange={event => setApiKey(event.target.value.trim())} placeholder={query.data?.configured ? 'Вставьте новый ключ для замены' : 'Ключ из кабинета OpenWeather'} /></label>
      <button className="btn-primary px-5 py-2.5 text-sm" disabled={!/^[a-f0-9]{32}$/i.test(apiKey) || save.isPending}>{save.isPending ? 'Проверяем ключ…' : 'Подключить погоду'}</button>
    </form>
    {save.isError && <p role="alert" className="text-sm text-red-700">{save.error.message}</p>}
    {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Ключ сохранён. Прогноз и история загружаются.</p>}
  </section>;
}
