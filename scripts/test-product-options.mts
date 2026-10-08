import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionCustomizations, resolveVariant, selectExtra } from '../src/lib/productOptions';
import { isSameCartLine } from '../src/store/cartStore';
import type { ProductWithRelations } from '../src/lib/types';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
const { priceOrderItem } = await import('../src/lib/orderPricing');
const link = (id: string, price: number, group: string | null = null, base = false) => ({
  id, productId: 'coffee', ingredientId: id, isDefault: base, isRemovable: base,
  isExtra: !base, optionGroup: group,
  ingredient: { id, name: id, price, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
});
const product = {
  id: 'coffee', price: 200, calories: 100, proteins: 10, isAvailable: true,
  category: { isActive: true },
  variants: [{ id: 'small', productId: 'coffee', name: '200 мл', price: null }, { id: 'large', productId: 'coffee', name: '400 мл', price: 300, calories: 0, volumeMl: 400 }],
  ingredients: [link('milk', 0, 'Молоко', true), link('oat', 40, 'Молоко'), link('soy', 50, 'Молоко'), link('protein', 60)],
} as ProductWithRelations;
const item = { productId: 'coffee', variantId: 'large', quantity: 2 };

test('null inherits and zero overrides price and nutrition', () => {
  assert.equal(resolveVariant(product, product.variants[0]).price, 200);
  assert.equal(resolveVariant(product, product.variants[1]).calories, 0);
  assert.equal(resolveVariant(product, product.variants[1]).proteins, 10);
  assert.equal(resolveVariant(product, { price: 0 }).price, 0);
});
test('single-choice replacement leaves independent extras selected', () => {
  const added = selectExtra(product.ingredients, new Set(['oat', 'protein']), 'soy');
  assert.deepEqual([...added].sort(), ['protein', 'soy']);
  assert.deepEqual(optionCustomizations(product.ingredients, new Set(), added).map((choice) => [choice.ingredientId, choice.action, choice.priceDelta]), [['milk', 'REMOVE', 0], ['soy', 'ADD', 50], ['protein', 'ADD', 60]]);
});
test('server ignores forged surcharges and snapshots actual names and variant price', () => {
  const result = priceOrderItem({ ...item, customizations: [{ ingredientId: 'oat', action: 'ADD', priceDelta: -9999 }] }, product);
  assert.equal(result.unitPrice, 340);
  assert.equal(result.variantName, '400 мл');
  assert.equal(result.quantity, 2);
  assert.equal(result.customizations[1].ingredientName, 'oat');
  assert.equal(result.customizations[0].action, 'REMOVE');
});
test('server rejects conflicting, duplicated, foreign or unavailable choices and invalid quantities', () => {
  for (const invalid of [
    { ...item, variantId: 'foreign' }, { ...item, variantId: null },
    ...[0, -1, 1.5, 101, NaN].map((quantity) => ({ ...item, quantity })),
    { ...item, customizations: [{ ingredientId: 'foreign', action: 'ADD' as const }] },
    { ...item, customizations: [{ ingredientId: 'oat', action: 'REMOVE' as const }] },
    { ...item, customizations: ['oat', 'soy'].map((ingredientId) => ({ ingredientId, action: 'ADD' as const })) },
    { ...item, customizations: ['protein', 'protein'].map((ingredientId) => ({ ingredientId, action: 'ADD' as const })) },
  ]) assert.throws(() => priceOrderItem(invalid, product));
  const unavailable = structuredClone(product);
  unavailable.ingredients[1].ingredient.isAvailable = false;
  assert.throws(() => priceOrderItem({ ...item, customizations: [{ ingredientId: 'oat', action: 'ADD' }] }, unavailable));
  assert.throws(() => priceOrderItem(item, { ...product, isAvailable: false }));
});
test('products without variants retain their base price', () => {
  assert.equal(priceOrderItem({ ...item, variantId: null }, { ...product, variants: [] }).unitPrice, 200);
});
test('cart keeps variants and customizations in separate lines', () => {
  const a = { productId: 'coffee', variantId: 'small', customizations: [] };
  assert.equal(isSameCartLine(a, { ...a, variantId: 'large' }), false);
  assert.equal(isSameCartLine(a, { ...a, customizations: [{ ingredientId: 'protein', ingredientName: 'protein', action: 'ADD', priceDelta: 60 }] }), false);
  assert.equal(isSameCartLine(a, { ...a }), true);
});
