import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isToppingsCategory, toppingCartItems, toppingOptions, type ToppingProduct } from '../src/lib/toppings';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } });
const { useCartStore } = await import('../src/store/cartStore');
const { useKioskCartStore } = await import('../src/store/kioskCartStore');

const toppings: ToppingProduct[] = [
  { id: 'sourcream', name: 'Сметана', price: 40, image: null, isAvailable: true, categoryActive: true, variants: [] },
  { id: 'jam', name: 'Джем', price: 50, image: null, isAvailable: true, categoryActive: true, variants: [{ id: 'strawberry', name: 'Клубничный', price: 55, image: null }, { id: 'free', name: 'Пробник', price: 0, image: null }] },
  { id: 'stopped', name: 'Мёд', price: 35, image: null, isAvailable: false, categoryActive: true, variants: [] },
  { id: 'hidden', name: 'Соус', price: 20, image: null, isAvailable: true, categoryActive: false, variants: [] },
];
test('toppings are products of the topping category, not similarly named dishes', () => {
  for (const name of ['Топпинги', ' топинги ', 'ТОППИНГ']) assert.equal(isToppingsCategory(name), true);
  for (const name of ['Завтраки', 'Топпинги и соусы', '']) assert.equal(isToppingsCategory(name), false);
});
test('only available toppings are offered and variant prices include zero overrides', () => {
  const options = toppingOptions(toppings);
  assert.equal(options.length, 3);
  assert.deepEqual(options.map((option) => option.price), [40,55,0]);
  assert.equal(options[1].variantId, 'strawberry');
});
test('multiple selected toppings use the dish quantity; no selection adds no toppings', () => {
  const options = toppingOptions(toppings);
  assert.deepEqual(toppingCartItems(toppings, new Set(), 2), []);
  const items = toppingCartItems(toppings, new Set([options[0].key, options[1].key, 'forged']), 2);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => [item.productId, item.variantId, item.quantity, item.basePrice]), [['sourcream',null,2,40],['jam','strawberry',2,55]]);
});
test('menu and kiosk totals, repeated adds and removal preserve ordinary catalog products', () => {
  const base = { productId: 'syrniki', name: 'Сырники', image: null, basePrice: 290, quantity: 2, customizations: [] };
  const options = toppingOptions(toppings);
  const items = [base, ...toppingCartItems(toppings, new Set([options[0].key, options[1].key]), 2)];
  for (const store of [useCartStore, useKioskCartStore]) {
    store.getState().clearCart();
    for (const item of items) store.getState().addItem(item);
    assert.equal(store.getState().getTotalPrice(), 770);
    assert.equal(store.getState().items.length, 3);
    for (const item of items) store.getState().addItem(item);
    assert.equal(store.getState().getTotalPrice(), 1540);
    assert.equal(store.getState().items.length, 3);
    store.getState().removeItem(store.getState().items.find((item) => item.productId === 'jam')!.id);
    assert.equal(store.getState().getTotalPrice(), 1320);
    store.getState().clearCart();
  }
});
