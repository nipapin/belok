# Belok

Веб-приложение для кафе: меню, корзина, заказы, бонусы и уровни лояльности. Клиент — [Next.js](https://nextjs.org) (App Router), данные — PostgreSQL через [Prisma](https://www.prisma.io).

Репозиторий: [github.com/nipapin/belok](https://github.com/nipapin/belok)

## Возможности

- Каталог блюд с категориями и кастомизацией ингредиентов
- Заказы со статусами и оплатой ([ЮKassa](https://yookassa.ru))
- Авторизация по телефону (код; в dev режиме код можно получить в ответе API)
- Программа лояльности: бонусы, уровни, кешбэк
- PWA (прогрессивное веб-приложение)
- UI на [MUI](https://mui.com/) и [Tailwind CSS](https://tailwindcss.com/)

## Требования

- **Node.js** 20+ (рекомендуется LTS)
- **PostgreSQL** (локально или облако)
- **npm** (или совместимый менеджер пакетов)

## Быстрый старт

1. Клонировать репозиторий и перейти в каталог проекта.

2. Установить зависимости:

   ```bash
   npm install
   ```

3. Создать файл `.env` в корне (см. раздел [Переменные окружения](#переменные-окружения)). Минимум для локальной разработки:

   - `DATABASE_URL`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - `NEXT_PUBLIC_APP_URL` (например `http://localhost:3000`)

4. Применить схему к БД и при желании заполнить тестовыми данными:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   Альтернатива без миграций (удобно для прототипа): `npm run db:push`

5. Запустить dev-сервер:

   ```bash
   npm run dev
   ```

   Открыть [http://localhost:3000](http://localhost:3000).

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Строка подключения PostgreSQL (обязательно для Prisma) |
| `JWT_SECRET` | Секрет для access-токенов |
| `JWT_REFRESH_SECRET` | Секрет для refresh-токенов |
| `NEXT_PUBLIC_APP_URL` | Публичный URL приложения (редиректы после оплаты и т.п.) |
| `USE_MOCK_DB` | Если `true` — режим без реальной БД (см. `src/lib/prisma.ts`) |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | ЮKassa (оплата) |
| `SMS_RU_API_KEY` | SMS.RU для отправки кодов в production |
| `GOOGLE_WALLET_ISSUER_EMAIL`, `GOOGLE_WALLET_ISSUER_ID` | Google Wallet (опционально) |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID` | Apple Wallet (опционально) |

В development часть функций ослаблена намеренно (например, код из SMS может возвращаться в ответе API — не используйте так в production).

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка, hot reload |
| `npm run build` | `prisma generate` + production-сборка Next.js |
| `npm run start` | Запуск собранного приложения |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Prisma Migrate (dev) |
| `npm run db:push` | Синхронизация схемы с БД без миграций |
| `npm run db:seed` | Заполнение БД из `prisma/seed.ts` |
| `npm run db:studio` | Prisma Studio — просмотр и правка данных в браузере |

## Сборка для production

```bash
npm run build
npm run start
```

Убедитесь, что на сервере заданы все нужные переменные окружения и доступна PostgreSQL. Для миграций на проде обычно используют `npx prisma migrate deploy` (отдельно от `db:migrate`).

## Лицензия

Приватный проект (`"private": true` в `package.json`). Условия распространения задайте при необходимости отдельно.
