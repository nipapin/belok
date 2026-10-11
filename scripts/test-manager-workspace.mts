import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportPeriod, reportCsv, type ReportRow } from '../src/lib/managerReports';
import { calculateAvailability, cartStockAvailability, type StockRequirement } from '../src/lib/inventoryAvailability';

test('report includes complete calendar days in Kaliningrad across years and leap days', () => {
  assert.deepEqual(reportPeriod('2024-02-29', '2026-10-11'), { start: '2024-02-28T22:00:00.000Z', end: '2026-10-11T22:00:00.000Z' });
  assert.deepEqual(reportPeriod('2026-10-11', '2026-10-11'), { start: '2026-10-10T22:00:00.000Z', end: '2026-10-11T22:00:00.000Z' });
  for (const range of [['2025-02-29', '2026-01-01'], ['2026-10-12', '2026-10-11'], ['', '2026-10-11'], ['2026-13-01', '2026-13-02']]) assert.throws(() => reportPeriod(...range as [string, string]));
});
test('CSV preserves comments and quantities and neutralizes spreadsheet formulas', () => {
  const row: ReportRow = { id: 'line', orderId: 'order', dailyNumber: 4, createdAt: '2026-10-10T22:00:00Z', productName: '=1+1', variantName: null, quantity: 2, unitPrice: 150, orderTotal: 280, paymentMethod: 'CASH', paymentStatus: 'SUCCEEDED', status: 'COMPLETED', comment: 'Без "лука";\nс собой' };
  const csv = reportCsv([row]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('11.10.2026'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"2";"150";"300";"280";"Наличные"'));
  assert.ok(csv.includes('"Без ""лука"";\nс собой"'));
});
const line = (changes: Partial<StockRequirement> = {}): StockRequirement => ({ itemId: 'flour', name: 'Мука', unit: 'g', required: '100', quantity: '1000', active: true, ...changes });
test('stop-list respects exact depletion, shared requirements, inactive items and absent recipes', () => {
  assert.equal(calculateAvailability([line()]).portions, 10);
  assert.equal(calculateAvailability([line({ quantity: '99.999' })]).state, 'STOP');
  assert.equal(calculateAvailability([line({ quantity: '100' })]).portions, 1);
  assert.equal(calculateAvailability([line(), line({ required: '50' })]).portions, 6);
  assert.equal(calculateAvailability([line({ active: false })]).state, 'STOP');
  assert.equal(calculateAvailability([]).state, 'UNCONFIGURED');
  assert.equal(calculateAvailability([line({ required: null })]).state, 'UNCONFIGURED');
});
test('prepared stock and packaging independently limit portions without assuming future production', () => {
  const result = calculateAvailability([line(), line({ itemId: 'prepared', name: 'Соус', quantity: '45', required: '20' }), line({ itemId: 'box', unit: 'pcs', quantity: '1', required: '1' })]);
  assert.equal(result.portions, 1);
  assert.equal(calculateAvailability([line({ required: '0.333333333', quantity: '1' })]).portions, 2);
});
test('a cart cannot exceed stock by splitting dishes into multiple lines or sharing ingredients', () => {
  const recipes = new Map([['dish', [line({ quantity: '200' })]], ['other', [line({ quantity: '200' })]]]);
  assert.equal(cartStockAvailability([{ productId: 'dish', quantity: 2 }], recipes).state, 'AVAILABLE');
  assert.equal(cartStockAvailability([{ productId: 'dish', quantity: 2 }, { productId: 'other', quantity: 1 }], recipes).state, 'STOP');
  assert.equal(cartStockAvailability([{ productId: 'dish', quantity: 1 }, { productId: 'dish', quantity: 2 }], recipes).state, 'STOP');
});
