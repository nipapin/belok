import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isToppingsCategory, parseNewTopping, toppingCartItems, toppingOptions, type ToppingProduct } from '../src/lib/toppings';
import { orderItemGroups } from '../src/lib/orderItemGroups';
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
test('quick creation accepts zero and comma prices and rejects malformed drafts', () => {
  assert.deepEqual(parseNewTopping({ name:' Карамель ', price:'45,50' }), { name:'Карамель',price:45.5 });
  assert.deepEqual(parseNewTopping({ name:'Пробник', price:0 }), { name:'Пробник',price:0 });
  for (const price of ['',-1,'-1','1.001','10abc',NaN,Infinity,1_000_001,null]) assert.equal(parseNewTopping({ name:'Карамель',price }),null);
  for (const name of ['', '   ', 'я'.repeat(121), null]) assert.equal(parseNewTopping({ name,price:10 }),null);
});
test('hidden categories keep their linked toppings available and variants include zero prices', () => {
  const options = toppingOptions(toppings);
  assert.equal(options.length, 4);
  assert.deepEqual(options.map((option) => option.price), [40,55,0,20]);
  assert.equal(options[1].variantId, 'strawberry');
});
test('multiple selected toppings use the dish quantity; no selection adds no toppings', () => {
  const options = toppingOptions(toppings);
  assert.deepEqual(toppingCartItems(toppings, new Set()), []);
  const items = toppingCartItems(toppings, new Set([options[0].key, options[1].key, 'forged']));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => [item.productId, item.variantId, item.basePrice]), [['sourcream',null,40],['jam','strawberry',55]]);
});
test('menu and kiosk keep toppings inside their exact dish and scale their quantities', () => {
  const base = { productId: 'syrniki', name: 'Сырники', image: null, basePrice: 290, quantity: 2, customizations: [] };
  const options = toppingOptions(toppings);
  const item = { ...base, toppings:toppingCartItems(toppings, new Set([options[0].key, options[1].key])) };
  for (const store of [useCartStore, useKioskCartStore]) {
    store.getState().clearCart();
    store.getState().addItem(item);
    assert.equal(store.getState().getTotalPrice(), 770);
    assert.equal(store.getState().items.length, 1);
    store.getState().addItem(item);
    assert.equal(store.getState().getTotalPrice(), 1540);
    assert.equal(store.getState().items.length, 1);
    store.getState().addItem(base);
    assert.equal(store.getState().items.length, 2, 'Dish with toppings must not merge with the plain dish');
    store.getState().updateQuantity(store.getState().items[0].id,1);
    assert.equal(store.getState().getTotalPrice(), 965);
    store.getState().removeItem(store.getState().items[0].id);
    assert.equal(store.getState().getTotalPrice(),580);
    store.getState().clearCart();
  }
});
test('order displays group identical dishes by their persisted parent IDs, preserving standalone toppings', () => {
  const items = [{id:'porridge-plain'},{id:'porridge-jam'},{id:'jam',parentItemId:'porridge-jam'},{id:'standalone-honey'}];
  assert.deepEqual(orderItemGroups(items).map(({item,toppings}) => [item.id,toppings.map((topping) => topping.id)]), [['porridge-plain',[]],['porridge-jam',['jam']],['standalone-honey',[]]]);
});
test('removing one topping retains the dish and other toppings, reprices quantities and merges matching lines', () => {
  const base = { productId:'syrniki',name:'Сырники',image:null,basePrice:290,quantity:2,customizations:[] };
  const options = toppingOptions(toppings);
  const choices = toppingCartItems(toppings,new Set([options[0].key,options[1].key]));
  for (const store of [useCartStore,useKioskCartStore]) {
    store.getState().clearCart();
    store.getState().addItem({...base,toppings:choices});
    store.getState().addItem({...base,quantity:1});
    const id = store.getState().items[0].id;
    store.getState().removeTopping(id,'jam','free');
    assert.equal(store.getState().getTotalPrice(),1060,'Removing a different topping variant must do nothing');
    store.getState().removeTopping(id,'jam','strawberry');
    assert.equal(store.getState().getTotalPrice(),950);
    assert.deepEqual(store.getState().items[0].toppings?.map((topping) => topping.productId),['sourcream']);
    assert.equal(store.getState().items[0].quantity,2);
    store.getState().removeTopping(id,'sourcream');
    assert.equal(store.getState().items.length,1);
    assert.equal(store.getState().items[0].quantity,3);
    assert.equal(store.getState().getTotalPrice(),870);
    store.getState().clearCart();
  }
});
