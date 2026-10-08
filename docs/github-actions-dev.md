# Сборка и доставка dev через GitHub Actions

Workflow `.github/workflows/dev.yml` запускается при push в `dev` и PR в `dev`.
GitHub устанавливает зависимости, запускает тесты поиска и вариантов товаров,
проверяет изменённые модули ESLint и собирает Next.js на Ubuntu 24.04 / Node 24.21.0.

Next.js настроен на `output: standalone`. В архив входят готовый `server.js`,
необходимые зависимости, `.next/static` и `public`, включая PWA worker.
Сборка не требует действующей базы или Claude: используются фиктивные серверные
переменные. `.env*` исключаются из пакета. Артефакт хранится в Actions 7 дней.

После успешной сборки ветки `dev` архив отправляется по SSH на Белок.
Для PR деплой и SSH-ключ недоступны. Actions закреплены по SHA; SSH проверяет
сохранённый публичный ключ сервера. Параллельные деплои сериализуются.

Настройки репозитория:

- secret `DEV_DEPLOY_SSH_KEY`: отдельный ключ только для этой доставки;
- vars `DEV_DEPLOY_HOST`, `DEV_DEPLOY_HOST_KEY`: адрес и проверенный host key;
- vars `DEV_VAPID_PUBLIC_KEY`, `DEV_MAPBOX_PUBLIC_KEY`: существующие публичные ключи
  для браузера (не приватные VAPID / Mapbox secrets).

На VPS `/usr/local/bin/belok-dev-deploy` принимает только `deploy <SHA>` и архив
через stdin. Ключ ограничен этой командой, без shell и перенаправления портов.
Проверяется размер архива, безопасное извлечение, отсутствие `.env*` и SHA версии.
Релиз сначала запускается на `127.0.0.1:3002` с текущими серверными переменными.
После проверки `/api/products` переключается `/var/www/belok-dev-current` и
перезапускается только PM2 `belok-dev` на порту 3001. При ошибке запуска процесс
возвращается к прежней версии. PM2 сохраняет настройки для запуска после reboot.

Конфигурация PM2: `/etc/belok-dev/ecosystem.config.cjs`.
Релизы: `/var/www/belok-dev-releases/<SHA>`; предыдущие версии сохраняются.
Загрузки связаны с постоянным `public/uploads` существующего checkout.
Настоящие backend secrets остаются в `.env` / `.env.local` на VPS и загружаются
Node через `--env-file`. Nginx и production-процесс не меняются.

Обычный `git push origin dev` (или `npm run deploy`) теперь включает весь цикл; на VPS больше не выполняются
`npm ci` и `next build`. Миграции общей базы выполняются отдельно после проверки:
деплой сам не меняет схему. Сборки и журналы доступны в
[GitHub Actions](https://github.com/nipapin/belok/actions).
