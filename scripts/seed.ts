import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

interface IngredientLink {
  ingredientId: string;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

interface ProductSeed {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  categoryId: string;
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
  fiber: number;
  sortOrder: number;
  ingredients: IngredientLink[];
}

const loyaltyLevels = [
  { name: 'Бронза',  minSpent: 0,     cashbackPercent: 3,  discountPercent: 0, sortOrder: 0 },
  { name: 'Серебро', minSpent: 5000,  cashbackPercent: 5,  discountPercent: 3, sortOrder: 1 },
  { name: 'Золото',  minSpent: 15000, cashbackPercent: 7,  discountPercent: 5, sortOrder: 2 },
  { name: 'Платина', minSpent: 30000, cashbackPercent: 10, discountPercent: 7, sortOrder: 3 },
];

const categories = [
  { id: 'cat-bowls',     name: 'Боулы',   sortOrder: 0 },
  { id: 'cat-smoothies', name: 'Смузи',   sortOrder: 1 },
  { id: 'cat-salads',    name: 'Салаты',  sortOrder: 2 },
  { id: 'cat-snacks',    name: 'Снэки',   sortOrder: 3 },
  { id: 'cat-drinks',    name: 'Напитки', sortOrder: 4 },
];

const ingredients = [
  { id: 'ing-chicken',  name: 'Куриная грудка', price: 80 },
  { id: 'ing-salmon',   name: 'Лосось',         price: 150 },
  { id: 'ing-tofu',     name: 'Тофу',           price: 60 },
  { id: 'ing-avocado',  name: 'Авокадо',        price: 100 },
  { id: 'ing-quinoa',   name: 'Киноа',          price: 50 },
  { id: 'ing-rice',     name: 'Бурый рис',      price: 30 },
  { id: 'ing-spinach',  name: 'Шпинат',         price: 40 },
  { id: 'ing-tomato',   name: 'Томаты',         price: 30 },
  { id: 'ing-cucumber', name: 'Огурцы',         price: 20 },
  { id: 'ing-egg',      name: 'Яйцо',           price: 30 },
  { id: 'ing-cheese',   name: 'Сыр фета',       price: 60 },
  { id: 'ing-nuts',     name: 'Орехи',          price: 50 },
  { id: 'ing-seeds',    name: 'Семена чиа',     price: 40 },
  { id: 'ing-banana',   name: 'Банан',          price: 30 },
  { id: 'ing-berries',  name: 'Ягоды',          price: 70 },
  { id: 'ing-protein',  name: 'Протеин',        price: 60 },
  { id: 'ing-honey',    name: 'Мёд',            price: 30 },
  { id: 'ing-granola',  name: 'Гранола',        price: 40 },
  { id: 'ing-hummus',   name: 'Хумус',          price: 50 },
  { id: 'ing-sauce',    name: 'Соус цезарь',    price: 30 },
];

const products: ProductSeed[] = [
  {
    id: 'prod-protein-bowl',
    name: 'Протеиновый боул',
    description: 'Сытный боул с куриной грудкой, киноа, авокадо и свежими овощами',
    price: 490, image: '/products/protein-bowl.jpg', categoryId: 'cat-bowls',
    calories: 520, proteins: 42, fats: 18, carbs: 48, fiber: 6, sortOrder: 0,
    ingredients: [
      { ingredientId: 'ing-chicken', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-quinoa',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-avocado', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-tomato',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-spinach', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-egg',     isDefault: false, isRemovable: false, isExtra: true  },
      { ingredientId: 'ing-cheese',  isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-salmon-bowl',
    name: 'Боул с лососем',
    description: 'Нежный лосось на подушке из бурого риса с эдамаме и авокадо',
    price: 650, image: '/products/salmon-bowl.jpg', categoryId: 'cat-bowls',
    calories: 580, proteins: 38, fats: 24, carbs: 52, fiber: 5, sortOrder: 1,
    ingredients: [
      { ingredientId: 'ing-salmon',   isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-rice',     isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-avocado',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-cucumber', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-seeds',    isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-tofu-bowl',
    name: 'Веган-боул с тофу',
    description: 'Маринованный тофу, киноа, хумус и свежие овощи',
    price: 420, image: '/products/tofu-bowl.jpg', categoryId: 'cat-bowls',
    calories: 440, proteins: 28, fats: 16, carbs: 50, fiber: 9, sortOrder: 2,
    ingredients: [
      { ingredientId: 'ing-tofu',    isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-quinoa',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-hummus',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-tomato',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-spinach', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-green-smoothie',
    name: 'Зелёный смузи',
    description: 'Шпинат, банан, семена чиа и миндальное молоко',
    price: 320, image: '/products/green-smoothie.jpg', categoryId: 'cat-smoothies',
    calories: 220, proteins: 8, fats: 6, carbs: 34, fiber: 4, sortOrder: 0,
    ingredients: [
      { ingredientId: 'ing-spinach', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-banana',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-seeds',   isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-protein', isDefault: false, isRemovable: false, isExtra: true  },
      { ingredientId: 'ing-honey',   isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-berry-smoothie',
    name: 'Ягодный смузи',
    description: 'Микс лесных ягод с бананом и протеином',
    price: 350, image: '/products/berry-smoothie.jpg', categoryId: 'cat-smoothies',
    calories: 260, proteins: 18, fats: 4, carbs: 40, fiber: 5, sortOrder: 1,
    ingredients: [
      { ingredientId: 'ing-berries', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-banana',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-protein', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-honey',   isDefault: false, isRemovable: false, isExtra: true  },
      { ingredientId: 'ing-granola', isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-caesar-salad',
    name: 'Цезарь с курицей',
    description: 'Классический салат Цезарь с куриной грудкой гриль',
    price: 390, image: '/products/caesar-salad.jpg', categoryId: 'cat-salads',
    calories: 380, proteins: 32, fats: 20, carbs: 18, fiber: 3, sortOrder: 0,
    ingredients: [
      { ingredientId: 'ing-chicken', isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-cheese',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-sauce',   isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-egg',     isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
  {
    id: 'prod-granola-bar',
    name: 'Гранола-бар',
    description: 'Домашний батончик с орехами, мёдом и семенами',
    price: 180, image: '/products/granola-bar.jpg', categoryId: 'cat-snacks',
    calories: 250, proteins: 8, fats: 12, carbs: 30, fiber: 3, sortOrder: 0,
    ingredients: [
      { ingredientId: 'ing-granola', isDefault: true, isRemovable: false, isExtra: false },
      { ingredientId: 'ing-nuts',    isDefault: true, isRemovable: false, isExtra: false },
      { ingredientId: 'ing-honey',   isDefault: true, isRemovable: false, isExtra: false },
    ],
  },
  {
    id: 'prod-protein-shake',
    name: 'Протеиновый шейк',
    description: 'Молочный шейк с двойной порцией протеина и бананом',
    price: 290, image: '/products/protein-shake.jpg', categoryId: 'cat-drinks',
    calories: 300, proteins: 30, fats: 6, carbs: 32, fiber: 2, sortOrder: 0,
    ingredients: [
      { ingredientId: 'ing-protein', isDefault: true,  isRemovable: false, isExtra: false },
      { ingredientId: 'ing-banana',  isDefault: true,  isRemovable: true,  isExtra: false },
      { ingredientId: 'ing-berries', isDefault: false, isRemovable: false, isExtra: true  },
    ],
  },
];

async function upsertLoyaltyLevel(client: PoolClient, level: typeof loyaltyLevels[number]) {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM "loyalty_levels" WHERE name = $1',
    [level.name]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const id = uuidv4();
  await client.query(
    `INSERT INTO "loyalty_levels"("id", "name", "minSpent", "cashbackPercent", "discountPercent", "sortOrder")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, level.name, level.minSpent, level.cashbackPercent, level.discountPercent, level.sortOrder]
  );
  return id;
}

async function upsertCategory(client: PoolClient, c: typeof categories[number]) {
  await client.query(
    `INSERT INTO "categories"("id", "name", "sortOrder")
     VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [c.id, c.name, c.sortOrder]
  );
}

async function upsertIngredient(client: PoolClient, i: typeof ingredients[number]) {
  await client.query(
    `INSERT INTO "ingredients"("id", "name", "price")
     VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [i.id, i.name, i.price]
  );
}

async function upsertProduct(client: PoolClient, p: ProductSeed) {
  await client.query(
    `INSERT INTO "products"
       ("id","name","description","price","image","categoryId","calories","proteins","fats","carbs","fiber","sortOrder")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT ("id") DO UPDATE SET
       "name" = EXCLUDED."name",
       "description" = EXCLUDED."description",
       "price" = EXCLUDED."price",
       "image" = EXCLUDED."image",
       "categoryId" = EXCLUDED."categoryId",
       "calories" = EXCLUDED."calories",
       "proteins" = EXCLUDED."proteins",
       "fats" = EXCLUDED."fats",
       "carbs" = EXCLUDED."carbs",
       "fiber" = EXCLUDED."fiber",
       "sortOrder" = EXCLUDED."sortOrder"`,
    [
      p.id, p.name, p.description, p.price, p.image, p.categoryId,
      p.calories, p.proteins, p.fats, p.carbs, p.fiber, p.sortOrder,
    ]
  );

  for (const link of p.ingredients) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM "product_ingredients" WHERE "productId" = $1 AND "ingredientId" = $2`,
      [p.id, link.ingredientId]
    );
    if (existing.rows[0]) continue;
    await client.query(
      `INSERT INTO "product_ingredients"
         ("id","productId","ingredientId","isDefault","isRemovable","isExtra")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), p.id, link.ingredientId, link.isDefault, link.isRemovable, link.isExtra]
    );
  }
}

async function upsertAdminUsers(client: PoolClient, defaultLoyaltyLevelId: string) {
  const adminEmails = (process.env.ADMIN_BYPASS_EMAILS ?? 'admin@belok.cafe')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM "users" WHERE email = $1',
      [email]
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE "users" SET role = 'ADMIN' WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO "users"("id","email","name","role","loyaltyLevelId")
         VALUES ($1,$2,$3,'ADMIN',$4)`,
        [uuidv4(), email, 'Администратор', defaultLoyaltyLevelId]
      );
    }
    console.log(`Admin user ensured (email: ${email})`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Configure it in .env first.');
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let bronzeId = '';
    for (const level of loyaltyLevels) {
      const id = await upsertLoyaltyLevel(client, level);
      if (level.name === 'Бронза') bronzeId = id;
    }
    console.log('Loyalty levels ready');

    for (const c of categories) await upsertCategory(client, c);
    console.log('Categories ready');

    for (const i of ingredients) await upsertIngredient(client, i);
    console.log('Ingredients ready');

    for (const p of products) await upsertProduct(client, p);
    console.log('Products & product-ingredients ready');

    await upsertAdminUsers(client, bronzeId);

    await client.query('COMMIT');
    console.log('\nSeed completed.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
