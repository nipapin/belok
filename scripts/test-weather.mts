import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampSalesPeriod, parseOpenWeather, summarizeWeather, weatherCondition, type WeatherHour } from '../src/lib/weather';

const hours = (source: 'forecast' | 'archive', temperature = 12): WeatherHour[] => Array.from({ length: 24 }, (_, hour) => ({
  time: `2026-10-01T${String(hour).padStart(2, '0')}:00:00Z`, source, temperature: hour >= 6 && hour < 19 ? temperature : -10,
  precipitation: hour >= 6 && hour < 19 ? 1 : 20, condition: 'cloud',
}));
test('opening hours are 08–21 Kaliningrad, 13 hours, rainfall sums and temperature averages', () => {
  const [day] = summarizeWeather(hours('archive'), '2026-10-01', '2026-10-01');
  assert.deepEqual(day, { day: '2026-10-01', source: 'archive', hours: 13, complete: true, temperature: 12, condition: 'cloud', precipitation: 13 });
});
test('full archive replaces forecast; incomplete archive cannot become actual or zero', () => {
  const [day] = summarizeWeather([...hours('forecast', 15), ...hours('archive', 11)], '2026-10-01', '2026-10-01');
  assert.equal(day.temperature, 11);
  const [pending] = summarizeWeather([...hours('forecast', 15), ...hours('archive', 11).slice(0, 10)], '2026-10-01', '2026-10-01');
  assert.equal(pending.source, 'forecast'); assert.equal(pending.temperature, 15);
  const [empty] = summarizeWeather([], '2026-10-01', '2026-10-01');
  assert.equal(empty.source, null); assert.equal(empty.precipitation, null);
});
test('incomplete day does not fabricate a full-day mean or rainfall sum', () => {
  const [day] = summarizeWeather(hours('forecast').slice(12), '2026-10-01', '2026-10-01');
  assert.equal(day.complete, false); assert.equal(day.hours, 7); assert.equal(day.precipitation, null); assert.equal(day.temperature, null);
});
test('a genuine partial archive remains visible with its hour count and no fabricated rainfall total', () => {
  const [day] = summarizeWeather(hours('archive', 12).filter(row => Date.parse(row.time) < Date.parse('2026-10-01T17:00:00Z')), '2026-10-01', '2026-10-01');
  assert.equal(day.source, 'archive'); assert.equal(day.hours, 11); assert.equal(day.complete, false);
  assert.equal(day.temperature, 12); assert.equal(day.precipitation, null);
});
test('OpenWeather metric response sums rain and snow; omitted rainfall is zero as documented', () => {
  const parsed = parseOpenWeather({ data: [{ dt: 1790834400, temp: 11, rain: { '1h': 0.2 }, snow: { '1h': 0.3 }, weather: [{ id: 601 }] }, { dt: 1790838000, temp: 12, weather: [{ id: 800 }] }] }, 'archive');
  assert.equal(parsed[0].precipitation, 0.5); assert.equal(parsed[0].condition, 'snow'); assert.equal(parsed[1].precipitation, 0);
  assert.throws(() => parseOpenWeather({}, 'archive'));
  assert.equal(parseOpenWeather({ data: [{ dt: 1790834400, temp: null }] }, 'archive').length, 0);
});
test('all supported conditions map to icons and an unknown code remains unknown', () => {
  assert.deepEqual([800, 801, 804, 501, 601, 211, 741, -1].map(weatherCondition), ['sun', 'partly-cloudy', 'cloud', 'rain', 'snow', 'storm', 'fog', null]);
});
test('date selection clamps before first order, future dates and reversed period', () => {
  assert.deepEqual(clampSalesPeriod('2020-01-01', '2026-10-14', '2026-05-24', '2026-10-13'), { from: '2026-05-24', to: '2026-10-13' });
  assert.deepEqual(clampSalesPeriod('2026-10-12', '2026-10-01', '2026-05-24', '2026-10-13'), { from: '2026-10-12', to: '2026-10-12' });
});
