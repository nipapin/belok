# Belok

Веб-приложение для кафе: меню, корзина, заказы, бонусы и уровни лояльности.
Стек — [Next.js](https://nextjs.org) (App Router) + PostgreSQL через [`pg`](https://node-postgres.com/) (без ORM).

Репозиторий: [github.com/nipapin/belok](https://github.com/nipapin/belok)

## Возможности

- Каталог блюд с категориями и кастомизацией ингредиентов
- Заказы со статусами и оплатой ([ЮKassa](https://yookassa.ru))
- Авторизация по **email + паролю + 6-значному коду** на почту
- Сессии **сохраняются до явного выхода** (cookie живёт ~10 лет, на сервере — запись `sessions`)
- Программа лояльности: бонусы, уровни, кешбэк
- PWA (прогрессивное веб-приложение)
- UI на [Tailwind CSS](https://tailwindcss.com/)

## Требования

- **Node.js** 20+ (рекомендуется LTS)
- **PostgreSQL 14+** (нативно или в облаке — Neon, Supabase, Railway и т.п.)
- **npm**

## Быстрый старт

```bash
npm install
# 1. Настройте DATABASE_URL в .env (см. ниже).
npm run db:migrate    # создаёт таблицы
npm run db:seed       # (опционально) наполняет демо-данными
npm run dev           # http://localhost:3000
```

## База данных

Поддерживается любой PostgreSQL ≥ 14. Достаточно просто указать `DATABASE_URL`
в `.env`. Никакого Docker, никакого Prisma — только драйвер `pg` и набор
обычных `.sql`-миграций в каталоге `migrations/`.

### Вариант A — нативный PostgreSQL на Windows

1. Скачайте установщик: <https://www.postgresql.org/download/windows/>
   (стандартный EnterpriseDB build, выберите версию 16 или новее).
2. После установки откройте `psql` (или pgAdmin) под суперпользователем
   `postgres` и создайте БД и пользователя, которые ждёт `.env`:

   ```sql
   CREATE ROLE belok WITH LOGIN PASSWORD 'nK9pQm2xR7vL4wJ8tZ3bH6cF1sY5gD0';
   CREATE DATABASE belok OWNER belok;
   ```

   (Пароль из дефолтного `.env` — поменяйте, если нужно, и синхронизируйте
   с `DATABASE_URL`.)
3. Проверьте, что строка из `.env` подключается:

   ```bash
   psql "postgresql://belok:nK9pQm2xR7vL4wJ8tZ3bH6cF1sY5gD0@localhost:5432/belok"
   ```

### Вариант B — облачный Postgres (Neon / Supabase / Railway)

1. Создайте бесплатную базу в любом облаке.
2. Скопируйте `connection string` (обычно вида
   `postgresql://user:pass@host/db?sslmode=require`).
3. Подставьте её в `DATABASE_URL` в `.env`. Если хост требует SSL, добавьте
   `DATABASE_SSL=true` (либо параметр `sslmode=require` уже в URL).

### Применение схемы

```bash
npm run db:migrate    # выполняет все .sql из ./migrations
npm run db:seed       # (опционально) демо-категории, товары, ингредиенты,
                      # уровни лояльности и админ-аккаунт из ADMIN_BYPASS_EMAILS
```

`npm run db:migrate` идемпотентен: уже применённые миграции запоминаются в
служебной таблице `_migrations` и пропускаются при повторном запуске.

## Авторизация по email

Поток:

- **Регистрация** — `email + пароль (≥ 8 символов) + имя (опц.)`. Сервер создаёт
  «черновую» запись пользователя (`emailVerifiedAt = NULL`) и шлёт 6-значный
  код на email. Пользователь вводит код → `emailVerifiedAt` ставится в `NOW()`,
  создаётся сессия и cookie `belok_session` (maxAge ≈ 10 лет).
- **Вход** — `email + пароль`. Проверяется bcrypt-хеш; при успехе сразу
  создаётся сессия. Никакого кода на каждом входе нет — пароль и есть фактор
  аутентификации.
- Если у аккаунта `emailVerifiedAt = NULL` (зарегистрировался, но код так и не
  ввёл), вход возвращает `requiresVerification: true` и шлёт свежий код —
  фронтенд сам переключается на шаг ввода кода.
- Сессия живёт, пока пользователь не нажмёт «Выйти» (`POST /api/auth/logout`).

В поле email подсказываются популярные провайдеры (`gmail.com`, `yandex.ru`,
`ya.ru`, `mail.ru`, …).

API:

| Маршрут                      | Назначение                                                                                  |
|------------------------------|---------------------------------------------------------------------------------------------|
| `POST /api/auth/register`    | Создаёт неподтверждённый аккаунт (или обновляет, если ещё не подтверждён) и шлёт код        |
| `POST /api/auth/login`       | Проверяет пароль; либо сразу создаёт сессию, либо шлёт код подтверждения email              |
| `POST /api/auth/verify-code` | Подтверждает email, создаёт сессию                                                          |
| `POST /api/auth/resend-code` | Повторно шлёт код подтверждения (только для неподтверждённых аккаунтов, rate-limited)       |
| `POST /api/auth/logout`      | Отзыв сессии + очистка cookie                                                               |
| `GET  /api/auth/me`          | Текущий пользователь по cookie                                                              |

Коды хранятся в БД **хэшированными** (SHA-256), TTL 10 минут, не более 5
попыток на код, повторная отправка не чаще 1 раза в 60 с.

## Отправка email (SMTP)

В production обязательно настройте SMTP в `.env`:

```dotenv
SMTP_HOST="smtp.yandex.ru"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="no-reply@belok.cafe"
SMTP_PASS="••••••••"
SMTP_FROM="Belok <no-reply@belok.cafe>"
```

В development при отсутствии `SMTP_HOST` код подтверждения **печатается в
консоль сервера** с яркой рамкой — это удобство для разработки (НЕ моки,
никакого fallback на данные), в production отсутствие SMTP вызовет ошибку
отправки.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Строка подключения PostgreSQL (обязательно) |
| `DATABASE_SSL` | `true`, если БД требует SSL (Neon, RDS, Supabase…) |
| `SESSION_SECRET` | Секрет для подписи cookie сессии (HMAC-SHA256) |
| `JWT_SECRET` | Используется только если `SESSION_SECRET` не задан (legacy) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Параметры SMTP для отправки кодов |
| `ADMIN_BYPASS_EMAILS` | Email-адреса (через запятую), которые получают роль `ADMIN` при первом входе |
| `NEXT_PUBLIC_APP_URL` | Публичный URL приложения (редиректы после оплаты и т.п.) |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | ЮKassa (оплата) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Хранилище изображений |
| `S3_REGION`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE` | Доп. параметры S3 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — используется только если S3 не настроен |
| `GOOGLE_WALLET_ISSUER_EMAIL`, `GOOGLE_WALLET_ISSUER_ID` | Google Wallet (опционально) |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID` | Apple Wallet (опционально) |

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка, hot reload |
| `npm run build` | Production-сборка Next.js |
| `npm run start` | Запуск собранного приложения |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Применить все новые `.sql`-файлы из `migrations/` |
| `npm run db:seed` | Заполнить БД демо-данными (`scripts/seed.ts`) |

## Структура слоя данных

```
migrations/
  001_init.sql          ← вся схема (idempotent, IF NOT EXISTS)
scripts/
  migrate.ts            ← простой раннер: читает .sql и пишет в _migrations
  seed.ts               ← наполнение демо-данными (raw pg)
src/lib/
  db.ts                 ← pg.Pool + helpers query / queryOne / withTransaction
```

## Сборка для production

```bash
npm run build
npm run start
```

Перед запуском убедитесь, что:

- доступен PostgreSQL по `DATABASE_URL`;
- настроены `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`;
- задан `SESSION_SECRET`;
- применены миграции: `npm run db:migrate`.

## Лицензия

Приватный проект (`"private": true` в `package.json`). Условия распространения задайте при необходимости отдельно.
