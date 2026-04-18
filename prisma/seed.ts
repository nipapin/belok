import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Loyalty Levels
  const bronze = await prisma.loyaltyLevel.upsert({
    where: { name: 'Бронза' },
    update: {},
    create: { name: 'Бронза', minSpent: 0, cashbackPercent: 3, discountPercent: 0, sortOrder: 0 },
  });
  const silver = await prisma.loyaltyLevel.upsert({
    where: { name: 'Серебро' },
    update: {},
    create: { name: 'Серебро', minSpent: 5000, cashbackPercent: 5, discountPercent: 3, sortOrder: 1 },
  });
  const gold = await prisma.loyaltyLevel.upsert({
    where: { name: 'Золото' },
    update: {},
    create: { name: 'Золото', minSpent: 15000, cashbackPercent: 7, discountPercent: 5, sortOrder: 2 },
  });
  const platinum = await prisma.loyaltyLevel.upsert({
    where: { name: 'Платина' },
    update: {},
    create: { name: 'Платина', minSpent: 30000, cashbackPercent: 10, discountPercent: 7, sortOrder: 3 },
  });

  console.log('Loyalty levels created:', { bronze, silver, gold, platinum });

  // Categories
  const bowls = await prisma.category.upsert({
    where: { id: 'cat-bowls' },
    update: {},
    create: { id: 'cat-bowls', name: 'Боулы', sortOrder: 0 },
  });
  const smoothies = await prisma.category.upsert({
    where: { id: 'cat-smoothies' },
    update: {},
    create: { id: 'cat-smoothies', name: 'Смузи', sortOrder: 1 },
  });
  const salads = await prisma.category.upsert({
    where: { id: 'cat-salads' },
    update: {},
    create: { id: 'cat-salads', name: 'Салаты', sortOrder: 2 },
  });
  const snacks = await prisma.category.upsert({
    where: { id: 'cat-snacks' },
    update: {},
    create: { id: 'cat-snacks', name: 'Снэки', sortOrder: 3 },
  });
  const drinks = await prisma.category.upsert({
    where: { id: 'cat-drinks' },
    update: {},
    create: { id: 'cat-drinks', name: 'Напитки', sortOrder: 4 },
  });

  console.log('Categories created');

  // Ingredients
  const ingredientData = [
    { id: 'ing-chicken', name: 'Куриная грудка', price: 80 },
    { id: 'ing-salmon', name: 'Лосось', price: 150 },
    { id: 'ing-tofu', name: 'Тофу', price: 60 },
    { id: 'ing-avocado', name: 'Авокадо', price: 100 },
    { id: 'ing-quinoa', name: 'Киноа', price: 50 },
    { id: 'ing-rice', name: 'Бурый рис', price: 30 },
    { id: 'ing-spinach', name: 'Шпинат', price: 40 },
    { id: 'ing-tomato', name: 'Томаты', price: 30 },
    { id: 'ing-cucumber', name: 'Огурцы', price: 20 },
    { id: 'ing-egg', name: 'Яйцо', price: 30 },
    { id: 'ing-cheese', name: 'Сыр фета', price: 60 },
    { id: 'ing-nuts', name: 'Орехи', price: 50 },
    { id: 'ing-seeds', name: 'Семена чиа', price: 40 },
    { id: 'ing-banana', name: 'Банан', price: 30 },
    { id: 'ing-berries', name: 'Ягоды', price: 70 },
    { id: 'ing-protein', name: 'Протеин', price: 60 },
    { id: 'ing-honey', name: 'Мёд', price: 30 },
    { id: 'ing-granola', name: 'Гранола', price: 40 },
    { id: 'ing-hummus', name: 'Хумус', price: 50 },
    { id: 'ing-sauce', name: 'Соус цезарь', price: 30 },
  ];

  for (const ing of ingredientData) {
    await prisma.ingredient.upsert({
      where: { id: ing.id },
      update: {},
      create: ing,
    });
  }

  console.log('Ingredients created');

  // Products
  const products = [
    {
      id: 'prod-protein-bowl',
      name: 'Протеиновый боул',
      description: 'Сытный боул с куриной грудкой, киноа, авокадо и свежими овощами',
      price: 490,
      image: '/products/protein-bowl.jpg',
      categoryId: bowls.id,
      calories: 520,
      proteins: 42,
      fats: 18,
      carbs: 48,
      sortOrder: 0,
      ingredients: [
        { ingredientId: 'ing-chicken', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-quinoa', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-avocado', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-tomato', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-egg', isDefault: false, isRemovable: false, isExtra: true },
        { ingredientId: 'ing-cheese', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-salmon-bowl',
      name: 'Боул с лососем',
      description: 'Нежный лосось на подушке из бурого риса с эдамаме и авокадо',
      price: 650,
      image: '/products/salmon-bowl.jpg',
      categoryId: bowls.id,
      calories: 580,
      proteins: 38,
      fats: 24,
      carbs: 52,
      sortOrder: 1,
      ingredients: [
        { ingredientId: 'ing-salmon', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-rice', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-avocado', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-cucumber', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-seeds', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-tofu-bowl',
      name: 'Веган-боул с тофу',
      description: 'Маринованный тофу, киноа, хумус и свежие овощи',
      price: 420,
      image: '/products/tofu-bowl.jpg',
      categoryId: bowls.id,
      calories: 440,
      proteins: 28,
      fats: 16,
      carbs: 50,
      sortOrder: 2,
      ingredients: [
        { ingredientId: 'ing-tofu', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-quinoa', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-hummus', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-tomato', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-green-smoothie',
      name: 'Зелёный смузи',
      description: 'Шпинат, банан, семена чиа и миндальное молоко',
      price: 320,
      image: '/products/green-smoothie.jpg',
      categoryId: smoothies.id,
      calories: 220,
      proteins: 8,
      fats: 6,
      carbs: 34,
      sortOrder: 0,
      ingredients: [
        { ingredientId: 'ing-spinach', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-seeds', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-protein', isDefault: false, isRemovable: false, isExtra: true },
        { ingredientId: 'ing-honey', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-berry-smoothie',
      name: 'Ягодный смузи',
      description: 'Микс лесных ягод с бананом и протеином',
      price: 350,
      image: '/products/berry-smoothie.jpg',
      categoryId: smoothies.id,
      calories: 260,
      proteins: 18,
      fats: 4,
      carbs: 40,
      sortOrder: 1,
      ingredients: [
        { ingredientId: 'ing-berries', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-protein', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-honey', isDefault: false, isRemovable: false, isExtra: true },
        { ingredientId: 'ing-granola', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-caesar-salad',
      name: 'Цезарь с курицей',
      description: 'Классический салат Цезарь с куриной грудкой гриль',
      price: 390,
      image: '/products/caesar-salad.jpg',
      categoryId: salads.id,
      calories: 380,
      proteins: 32,
      fats: 20,
      carbs: 18,
      sortOrder: 0,
      ingredients: [
        { ingredientId: 'ing-chicken', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-cheese', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-sauce', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-egg', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-avocado', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
    {
      id: 'prod-granola-bar',
      name: 'Гранола-бар',
      description: 'Домашний батончик с орехами, мёдом и семенами',
      price: 180,
      image: '/products/granola-bar.jpg',
      categoryId: snacks.id,
      calories: 250,
      proteins: 8,
      fats: 12,
      carbs: 30,
      sortOrder: 0,
      ingredients: [
        { ingredientId: 'ing-granola', isDefault: true, isRemovable: false, isExtra: false },
        { ingredientId: 'ing-nuts', isDefault: true, isRemovable: false, isExtra: false },
        { ingredientId: 'ing-honey', isDefault: true, isRemovable: false, isExtra: false },
      ],
    },
    {
      id: 'prod-protein-shake',
      name: 'Протеиновый шейк',
      description: 'Молочный шейк с двойной порцией протеина и бананом',
      price: 290,
      image: '/products/protein-shake.jpg',
      categoryId: drinks.id,
      calories: 300,
      proteins: 30,
      fats: 6,
      carbs: 32,
      sortOrder: 0,
      ingredients: [
        { ingredientId: 'ing-protein', isDefault: true, isRemovable: false, isExtra: false },
        { ingredientId: 'ing-banana', isDefault: true, isRemovable: true, isExtra: false },
        { ingredientId: 'ing-berries', isDefault: false, isRemovable: false, isExtra: true },
      ],
    },
  ];

  for (const { ingredients, ...productData } of products) {
    await prisma.product.upsert({
      where: { id: productData.id },
      update: {},
      create: productData,
    });

    for (const ing of ingredients) {
      await prisma.productIngredient.upsert({
        where: {
          productId_ingredientId: {
            productId: productData.id,
            ingredientId: ing.ingredientId,
          },
        },
        update: {},
        create: {
          productId: productData.id,
          ...ing,
        },
      });
    }
  }

  console.log('Products and product-ingredients created');

  // Admin user
  await prisma.user.upsert({
    where: { phone: '+70000000000' },
    update: {},
    create: {
      phone: '+70000000000',
      name: 'Администратор',
      role: 'ADMIN',
      loyaltyLevelId: bronze.id,
    },
  });

  console.log('Admin user created (phone: +70000000000)');

  for (const phone of ['+79527941013', '+79258112653'] as const) {
    await prisma.user.upsert({
      where: { phone },
      update: { role: 'ADMIN' },
      create: {
        phone,
        name: 'Администратор',
        role: 'ADMIN',
        loyaltyLevelId: bronze.id,
      },
    });
    console.log(`Admin bypass user ensured (phone: ${phone})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
