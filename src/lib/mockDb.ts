/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuidv4 } from 'uuid';

// ─── Seed Data ───

const loyaltyLevels = [
  { id: 'll-bronze', name: 'Бронза', minSpent: 0, cashbackPercent: 3, discountPercent: 0, sortOrder: 0 },
  { id: 'll-silver', name: 'Серебро', minSpent: 5000, cashbackPercent: 5, discountPercent: 3, sortOrder: 1 },
  { id: 'll-gold', name: 'Золото', minSpent: 15000, cashbackPercent: 7, discountPercent: 5, sortOrder: 2 },
  { id: 'll-platinum', name: 'Платина', minSpent: 30000, cashbackPercent: 10, discountPercent: 7, sortOrder: 3 },
];

const categories = [
  { id: 'cat-bowls', name: 'Боулы', image: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-smoothies', name: 'Смузи', image: null, sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-salads', name: 'Салаты', image: null, sortOrder: 2, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-snacks', name: 'Снэки', image: null, sortOrder: 3, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-drinks', name: 'Напитки', image: null, sortOrder: 4, isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

const ingredients = [
  { id: 'ing-chicken', name: 'Куриная грудка', price: 80, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-salmon', name: 'Лосось', price: 150, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-tofu', name: 'Тофу', price: 60, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-avocado', name: 'Авокадо', price: 100, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-quinoa', name: 'Киноа', price: 50, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-rice', name: 'Бурый рис', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-spinach', name: 'Шпинат', price: 40, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-tomato', name: 'Томаты', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-cucumber', name: 'Огурцы', price: 20, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-egg', name: 'Яйцо', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-cheese', name: 'Сыр фета', price: 60, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-nuts', name: 'Орехи', price: 50, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-seeds', name: 'Семена чиа', price: 40, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-banana', name: 'Банан', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-berries', name: 'Ягоды', price: 70, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-protein', name: 'Протеин', price: 60, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-honey', name: 'Мёд', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-granola', name: 'Гранола', price: 40, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-hummus', name: 'Хумус', price: 50, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'ing-sauce', name: 'Соус цезарь', price: 30, isAvailable: true, createdAt: new Date(), updatedAt: new Date() },
];

const products = [
  { id: 'prod-protein-bowl', name: 'Протеиновый боул', description: 'Сытный боул с куриной грудкой, киноа, авокадо и свежими овощами', price: 490, image: '/products/protein-bowl.jpg', categoryId: 'cat-bowls', isAvailable: true, calories: 520, proteins: 42, fats: 18, carbs: 48, fiber: 6, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-salmon-bowl', name: 'Боул с лососем', description: 'Нежный лосось на подушке из бурого риса с эдамаме и авокадо', price: 650, image: '/products/salmon-bowl.jpg', categoryId: 'cat-bowls', isAvailable: true, calories: 580, proteins: 38, fats: 24, carbs: 52, fiber: 5, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-tofu-bowl', name: 'Веган-боул с тофу', description: 'Маринованный тофу, киноа, хумус и свежие овощи', price: 420, image: '/products/tofu-bowl.jpg', categoryId: 'cat-bowls', isAvailable: true, calories: 440, proteins: 28, fats: 16, carbs: 50, fiber: 9, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-green-smoothie', name: 'Зелёный смузи', description: 'Шпинат, банан, семена чиа и миндальное молоко', price: 320, image: '/products/green-smoothie.jpg', categoryId: 'cat-smoothies', isAvailable: true, calories: 220, proteins: 8, fats: 6, carbs: 34, fiber: 4, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-berry-smoothie', name: 'Ягодный смузи', description: 'Микс лесных ягод с бананом и протеином', price: 350, image: '/products/berry-smoothie.jpg', categoryId: 'cat-smoothies', isAvailable: true, calories: 260, proteins: 18, fats: 4, carbs: 40, fiber: 5, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-caesar-salad', name: 'Цезарь с курицей', description: 'Классический салат Цезарь с куриной грудкой гриль', price: 390, image: '/products/caesar-salad.jpg', categoryId: 'cat-salads', isAvailable: true, calories: 380, proteins: 32, fats: 20, carbs: 18, fiber: 3, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-granola-bar', name: 'Гранола-бар', description: 'Домашний батончик с орехами, мёдом и семенами', price: 180, image: '/products/granola-bar.jpg', categoryId: 'cat-snacks', isAvailable: true, calories: 250, proteins: 8, fats: 12, carbs: 30, fiber: 3, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  { id: 'prod-protein-shake', name: 'Протеиновый шейк', description: 'Молочный шейк с двойной порцией протеина и бананом', price: 290, image: '/products/protein-shake.jpg', categoryId: 'cat-drinks', isAvailable: true, calories: 300, proteins: 30, fats: 6, carbs: 32, fiber: 2, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
];

const productIngredients = [
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-chicken', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-quinoa', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-avocado', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-tomato', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-egg', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-protein-bowl', ingredientId: 'ing-cheese', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-salmon-bowl', ingredientId: 'ing-salmon', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-salmon-bowl', ingredientId: 'ing-rice', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-salmon-bowl', ingredientId: 'ing-avocado', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-salmon-bowl', ingredientId: 'ing-cucumber', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-salmon-bowl', ingredientId: 'ing-seeds', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-tofu', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-quinoa', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-hummus', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-tomato', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-tofu-bowl', ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-green-smoothie', ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-green-smoothie', ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-green-smoothie', ingredientId: 'ing-seeds', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-green-smoothie', ingredientId: 'ing-protein', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-green-smoothie', ingredientId: 'ing-honey', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-berry-smoothie', ingredientId: 'ing-berries', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-berry-smoothie', ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-berry-smoothie', ingredientId: 'ing-protein', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-berry-smoothie', ingredientId: 'ing-honey', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-berry-smoothie', ingredientId: 'ing-granola', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-caesar-salad', ingredientId: 'ing-chicken', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-caesar-salad', ingredientId: 'ing-cheese', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-caesar-salad', ingredientId: 'ing-sauce', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-caesar-salad', ingredientId: 'ing-egg', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-caesar-salad', ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true },
  { id: uuidv4(), productId: 'prod-granola-bar', ingredientId: 'ing-granola', isDefault: true, isRemovable: false, isExtra: false },
  { id: uuidv4(), productId: 'prod-granola-bar', ingredientId: 'ing-nuts', isDefault: true, isRemovable: false, isExtra: false },
  { id: uuidv4(), productId: 'prod-granola-bar', ingredientId: 'ing-honey', isDefault: true, isRemovable: false, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-shake', ingredientId: 'ing-protein', isDefault: true, isRemovable: false, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-shake', ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
  { id: uuidv4(), productId: 'prod-protein-shake', ingredientId: 'ing-berries', isDefault: false, isRemovable: false, isExtra: true },
];

const users: any[] = [
  { id: 'user-admin', phone: '+70000000000', name: 'Администратор', email: null, role: 'ADMIN', bonusBalance: 500, totalSpent: 8500, loyaltyLevelId: 'll-silver', createdAt: new Date('2024-01-01'), updatedAt: new Date() },
  { id: 'user-admin-bypass-1', phone: '+79527941013', name: 'Администратор', email: null, role: 'ADMIN', bonusBalance: 0, totalSpent: 0, loyaltyLevelId: 'll-bronze', createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-admin-bypass-2', phone: '+79258112653', name: 'Администратор', email: null, role: 'ADMIN', bonusBalance: 0, totalSpent: 0, loyaltyLevelId: 'll-bronze', createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-demo', phone: '+79991234567', name: 'Демо Пользователь', email: 'demo@belok.cafe', role: 'USER', bonusBalance: 245, totalSpent: 3200, loyaltyLevelId: 'll-bronze', createdAt: new Date('2024-06-15'), updatedAt: new Date() },
];

const orders: any[] = [
  {
    id: 'order-1', userId: 'user-demo', status: 'COMPLETED', total: 490, discountAmount: 0,
    bonusUsed: 0, bonusEarned: 15, paymentStatus: 'SUCCEEDED', paymentId: 'pay-1',
    comment: null, createdAt: new Date(Date.now() - 86400000 * 3), updatedAt: new Date(),
  },
  {
    id: 'order-2', userId: 'user-demo', status: 'PREPARING', total: 970, discountAmount: 0,
    bonusUsed: 50, bonusEarned: 0, paymentStatus: 'SUCCEEDED', paymentId: 'pay-2',
    comment: 'Без лука пожалуйста', createdAt: new Date(Date.now() - 3600000), updatedAt: new Date(),
  },
];

const orderItems: any[] = [
  { id: 'oi-1', orderId: 'order-1', productId: 'prod-protein-bowl', quantity: 1, unitPrice: 490 },
  { id: 'oi-2', orderId: 'order-2', productId: 'prod-salmon-bowl', quantity: 1, unitPrice: 650 },
  { id: 'oi-3', orderId: 'order-2', productId: 'prod-green-smoothie', quantity: 1, unitPrice: 320 },
];

const orderItemCustomizations: any[] = [];

const bonusTransactions: any[] = [
  { id: 'bt-1', userId: 'user-demo', amount: 15, type: 'EARNED', orderId: 'order-1', description: 'Кэшбэк 3% за заказ', createdAt: new Date(Date.now() - 86400000 * 3) },
  { id: 'bt-2', userId: 'user-demo', amount: -50, type: 'SPENT', orderId: 'order-2', description: 'Списание бонусов за заказ', createdAt: new Date(Date.now() - 3600000) },
  { id: 'bt-3', userId: 'user-demo', amount: 280, type: 'MANUAL', orderId: null, description: 'Приветственные бонусы', createdAt: new Date(Date.now() - 86400000 * 30) },
];

const refreshTokens: any[] = [];
const verificationCodes: any[] = [];

// ─── Helpers ───

function matchWhere(item: any, where: any): boolean {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    const cond = where[key];
    if (cond === undefined) continue;
    if (cond !== null && typeof cond === 'object') {
      if ('in' in cond) { if (!cond.in.includes(item[key])) return false; continue; }
      if ('gt' in cond) { if (!(item[key] > cond.gt)) return false; continue; }
      if ('gte' in cond) { if (!(item[key] >= cond.gte)) return false; continue; }
      if ('lt' in cond) { if (!(item[key] < cond.lt)) return false; continue; }
      if ('lte' in cond) { if (!(item[key] <= cond.lte)) return false; continue; }
    }
    const val = item[key] === undefined && typeof cond === 'boolean' ? false : item[key];
    if (val !== cond) return false;
  }
  return true;
}

function sortBy(arr: any[], orderBy: any): any[] {
  if (!orderBy) return arr;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...arr].sort((a, b) => {
    for (const spec of specs) {
      for (const key in spec) {
        const dir = spec[key] === 'desc' ? -1 : 1;
        if (a[key] < b[key]) return -1 * dir;
        if (a[key] > b[key]) return 1 * dir;
      }
    }
    return 0;
  });
}

function resolveProduct(p: any, opts?: any) {
  const result = { ...p };
  if (opts?.include?.category) {
    result.category = categories.find(c => c.id === p.categoryId) || null;
  }
  if (opts?.include?.ingredients) {
    const pis = productIngredients.filter(pi => pi.productId === p.id);
    result.ingredients = pis.map(pi => ({
      ...pi,
      ingredient: ingredients.find(i => i.id === pi.ingredientId)!,
    }));
  }
  return result;
}

function resolveUser(u: any, opts?: any) {
  const result = { ...u };
  if (opts?.include?.loyaltyLevel) {
    result.loyaltyLevel = loyaltyLevels.find(l => l.id === u.loyaltyLevelId) || null;
  }
  if (opts?.include?._count?.select?.orders) {
    result._count = { orders: orders.filter(o => o.userId === u.id).length };
  }
  return result;
}

function resolveOrder(o: any, opts?: any) {
  const result = { ...o };
  if (opts?.include?.user) {
    const u = users.find(u => u.id === o.userId);
    if (opts.include.user.select) {
      result.user = u ? Object.fromEntries(
        Object.keys(opts.include.user.select).map(k => [k, (u as any)[k]])
      ) : null;
    } else if (opts.include.user.include) {
      result.user = u ? resolveUser(u, { include: opts.include.user.include }) : null;
    } else {
      result.user = u || null;
    }
  }
  if (opts?.include?.items) {
    const items = orderItems.filter(i => i.orderId === o.id);
    result.items = items.map(item => {
      const resolved: any = { ...item };
      if (opts.include.items.include?.product) {
        resolved.product = products.find(p => p.id === item.productId) || null;
      }
      if (opts.include.items.include?.customizations) {
        resolved.customizations = orderItemCustomizations.filter(c => c.orderItemId === item.id);
      }
      return resolved;
    });
  }
  return result;
}

// ─── Mock Prisma Client ───

function createCrudModel(store: any[], resolveFn?: (item: any, opts?: any) => any) {
  const resolve = resolveFn || ((item: any) => ({ ...item }));

  return {
    findMany: async (opts?: any) => {
      let result = store.filter(item => matchWhere(item, opts?.where));
      result = sortBy(result, opts?.orderBy);
      if (opts?.take) result = result.slice(0, opts.take);
      result = result.map(item => resolve(item, opts));
      if (opts?.include?._count) {
        result = result.map(item => {
          const countResult: any = {};
          if (opts.include._count.select) {
            for (const rel of Object.keys(opts.include._count.select)) {
              if (rel === 'products') {
                const where = opts.include._count.select.products?.where;
                const prods = products.filter(p => p.categoryId === item.id && (!where || matchWhere(p, where)));
                countResult.products = prods.length;
              } else if (rel === 'orders') {
                countResult.orders = orders.filter(o => o.userId === item.id).length;
              } else if (rel === 'users') {
                countResult.users = users.filter(u => u.loyaltyLevelId === item.id).length;
              }
            }
          }
          return { ...item, _count: countResult };
        });
      }
      return result;
    },
    findUnique: async (opts?: any) => {
      const key = Object.keys(opts.where)[0];
      const item = store.find(i => i[key] === opts.where[key]);
      return item ? resolve(item, opts) : null;
    },
    findUniqueOrThrow: async (opts?: any) => {
      const key = Object.keys(opts.where)[0];
      const item = store.find(i => i[key] === opts.where[key]);
      if (!item) {
        const err = new Error('Record to find does not exist.') as Error & { code?: string };
        err.code = 'P2025';
        throw err;
      }
      return resolve(item, opts);
    },
    findFirst: async (opts?: any) => {
      let result = store.filter(item => matchWhere(item, opts?.where));
      result = sortBy(result, opts?.orderBy);
      return result.length > 0 ? resolve(result[0], opts) : null;
    },
    create: async (opts: any) => {
      const item = { id: uuidv4(), ...opts.data, createdAt: new Date(), updatedAt: new Date() };
      if (opts.data.items?.create) {
        const createdItems = [];
        for (const itemData of opts.data.items.create) {
          const { customizations, ...rest } = itemData;
          const oi = { id: uuidv4(), orderId: item.id, ...rest };
          orderItems.push(oi);
          if (customizations?.create) {
            for (const cust of customizations.create) {
              orderItemCustomizations.push({ id: uuidv4(), orderItemId: oi.id, ...cust });
            }
          }
          createdItems.push(oi);
        }
      }
      if (opts.data.ingredients?.create) {
        for (const ing of opts.data.ingredients.create) {
          productIngredients.push({ id: uuidv4(), productId: item.id, ...ing });
        }
      }
      store.push(item);
      return resolve(item, opts);
    },
    update: async (opts: any) => {
      const key = Object.keys(opts.where)[0];
      const idx = store.findIndex(i => i[key] === opts.where[key]);
      if (idx === -1) throw new Error('Not found');
      const data = { ...opts.data };
      for (const k in data) {
        if (data[k] && typeof data[k] === 'object' && 'increment' in data[k]) {
          data[k] = (store[idx][k] || 0) + data[k].increment;
        }
        if (data[k] && typeof data[k] === 'object' && 'decrement' in data[k]) {
          data[k] = (store[idx][k] || 0) - data[k].decrement;
        }
      }
      if (data.ingredients?.create) {
        for (const ing of data.ingredients.create) {
          productIngredients.push({ id: uuidv4(), productId: store[idx].id, ...ing });
        }
        delete data.ingredients;
      }
      store[idx] = { ...store[idx], ...data, updatedAt: new Date() };
      return resolve(store[idx], opts);
    },
    delete: async (opts: any) => {
      const key = Object.keys(opts.where)[0];
      const idx = store.findIndex(i => i[key] === opts.where[key]);
      if (idx === -1) throw new Error('Not found');
      const removed = store.splice(idx, 1)[0];
      return removed;
    },
    deleteMany: async (opts?: any) => {
      const toRemove = store.filter(item => matchWhere(item, opts?.where));
      for (const item of toRemove) {
        const idx = store.indexOf(item);
        if (idx !== -1) store.splice(idx, 1);
      }
      return { count: toRemove.length };
    },
    upsert: async (opts: any) => {
      const key = Object.keys(opts.where)[0];
      const existing = store.find(i => i[key] === opts.where[key]);
      if (existing) {
        Object.assign(existing, opts.update, { updatedAt: new Date() });
        return existing;
      }
      const item = { id: uuidv4(), ...opts.create, createdAt: new Date(), updatedAt: new Date() };
      store.push(item);
      return item;
    },
  };
}

export function createMockPrisma() {
  return {
    user: createCrudModel(users, resolveUser),
    loyaltyLevel: createCrudModel(loyaltyLevels),
    category: createCrudModel(categories),
    product: createCrudModel(products, resolveProduct),
    ingredient: createCrudModel(ingredients),
    productIngredient: createCrudModel(productIngredients),
    order: createCrudModel(orders, resolveOrder),
    orderItem: createCrudModel(orderItems),
    orderItemCustomization: createCrudModel(orderItemCustomizations),
    bonusTransaction: createCrudModel(bonusTransactions),
    refreshToken: createCrudModel(refreshTokens),
    verificationCode: createCrudModel(verificationCodes),
    $disconnect: async () => {},
  };
}
