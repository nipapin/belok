# Автодеплой master

`master.yml` запускается после push в `master`, для PR и вручную из Actions.
GitHub устанавливает зависимости, запускает тесты и собирает standalone-релиз.
На VPS передается готовый архив: `npm ci` и сборка там больше не нужны.
Для PR доставка на сервер не выполняется.

## Однократное включение

В SSH-сессии на рабочем VPS, в каталоге production checkout ветки master:

```bash
git pull --ff-only origin master
python3 scripts/deploy/setup-prod.py
```

Установщик определяет текущий каталог, порт и окружение по PM2-процессу `belok`.
Не запускайте его в каталоге dev. Установка не перезапускает приложение.
Он устанавливает отдельный receiver `/usr/local/bin/belok-prod-deploy`, создает
отдельный SSH-ключ и сохраняет конфигурацию в `/etc/belok-prod` с правами 600.
Ключ допускает только `deploy <SHA>`, без интерактивного shell и port forwarding.
Если скрипт запускается вне SSH, укажите `PROD_DEPLOY_HOST` — доступный из GitHub адрес VPS.
Preview использует свободный порт 3003; при необходимости задайте `PROD_PREVIEW_PORT`.

Если на VPS установлен и авторизован `gh`, скрипт сам добавит настройки в
`nipapin/belok` и запустит первый workflow. Иначе добавьте в
[Settings → Secrets and variables → Actions](https://github.com/nipapin/belok/settings/secrets/actions):

- Secret `PROD_DEPLOY_SSH_KEY`: содержимое `/root/.ssh/belok-prod-actions`.
- Variables из `/etc/belok-prod/github-variables.json`: `PROD_DEPLOY_HOST`,
  `PROD_DEPLOY_HOST_KEY`, `PROD_VAPID_PUBLIC_KEY`, `PROD_MAPBOX_PUBLIC_KEY`.
- Variable `PROD_DEPLOY_ENABLED`: `true`, после установки receiver и добавления ключа.

Затем в Actions откройте **Build and deploy production → Run workflow → master**.
Приватный ключ вводится только в GitHub Secret; не публикуйте его в чатах и коммитах.
Public VAPID и Mapbox берутся из существующего production-окружения;
для карты нужен публичный токен `pk.`, а не секретный `sk.`.
До включения `PROD_DEPLOY_ENABLED` workflow только проверяет и собирает код.
Успешная сборка на этом этапе не означает доставку на VPS.

## Обычные обновления

```bash
git push origin master
```

Или `npm run deploy`. Прежняя ручная команда сохранена как `npm run deploy:manual`
для старого checkout; после перехода на релизы она не обновляет активный standalone.
Receiver принимает архив, исключает `.env*`, сохраняет постоянные загрузки и
запускает preview с настоящим серверным окружением. Проверяет `/api/products`
и build manifest. Preview не запускает фоновый AQSI worker.
После успешной проверки переключает `/var/www/belok-prod-current` и PM2 `belok`.
Ошибку запуска сопровождает откат, включая возврат к прежнему `npm start`
при первом переходе. Сертификаты Т-Банка сохраняются и проверяются до переключения.
Dev-процесс, база и Nginx не изменяются. Миграции выполняются отдельно.

Nginx должен проксировать запросы на прежний production-порт. Если у вас есть
отдельный `alias` для `.next/static`, направьте его на
`/var/www/belok-prod-current/.next/static`; для файлов из `public` — на
`/var/www/belok-prod-current/public`. Постоянные uploads остаются в исходном checkout.
Receiver ничего не удаляет из старого checkout; `.env*` остаются только на VPS.
Конфигурация PM2 и окружение фиксируются при установке. После изменения окружения
повторите установщик, чтобы сохранить настройки для следующих релизов.

Журналы: [GitHub Actions](https://github.com/nipapin/belok/actions/workflows/master.yml).
Релизы: `/var/www/belok-prod-releases/<SHA>`, включая `preview.log`.
При неудачном релизе для новой попытки используйте новый commit SHA.
