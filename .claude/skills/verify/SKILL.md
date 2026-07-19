---
name: verify
description: Как проверить изменение Fuse вживую — headless (curl+JWT) и в браузере (chrome-devtools MCP) против живых dev-серверов
---

# Проверка Fuse вживую

Dev-серверы поднимает пользователь (не убивать его процессы): бэкенд `nest --watch` на :3001 (сам подхватывает правки), фронтенд `nuxt dev` на :5173. Инфра — `pnpm infra` (docker: `fuse-mongo` :27018, `fuse-localstack` SQS :4566, `fuse-minio` :9000). Профиль `.env.local` перекрывает `.env`.

## Handle

1. **Бэкенд жив:** `curl http://localhost:3001/api/schema.json` → 200 (заодно источник для `pnpm gen:types`).
2. **JWT** (авторизация — кука `access_token`):
   ```bash
   SECRET=$(grep '^JWT_SECRET' .env | sed 's/JWT_SECRET=//')
   DIR=$(ls -d node_modules/.pnpm/jsonwebtoken@*/node_modules/jsonwebtoken | head -1)
   SECRET=$SECRET DIR=$DIR node -e "console.log(require(require('path').resolve(process.env.DIR)).sign({userId:'<id из users>',email:'seed@fuse.local'},process.env.SECRET,{expiresIn:'4h'}))"
   ```
   Юзер `seed@fuse.local` есть в локальной Mongo. Дальше `curl -b "access_token=$TOKEN" ...`.
3. **Mongo напрямую:** `MURL=$(grep '^MONGODB_URL' .env.local | sed 's/MONGODB_URL=//' | sed 's|27018|27017|')` → `docker exec fuse-mongo mongosh --quiet "$MURL" --eval '...'`. Так сидятся app+scenario для сквозных проверок (ownerId = реальный user id).
4. **Мок-провайдер:** node http-сервер на :8091 (`localhost` уже в `SSRF_ALLOWED_HOSTS`), фоном через run_in_background; журнал вызовов — endpoint `/calls`.
5. **MinIO:** `docker exec fuse-minio sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; mc stat local/fuse/<objectName>'` — проверка наличия/удаления объекта.

## Браузер (chrome-devtools MCP)

- Ошибка «browser is already running» → это осиротевший Chrome ПРОШЛОЙ MCP-сессии на профиле `C:\Users\user\.cache\chrome-devtools-mcp\chrome-profile`; убедиться по CommandLine и убить только эти процессы — пользовательского браузера не касается.
- Авторизация: открыть `http://localhost:5173`, `evaluate_script` → `document.cookie = "access_token=<jwt>; path=/"` (кука с :5173 уходит и на :3001 — порты куки не различают), затем навигация на приватную страницу.
- Реалтайм проверяется так: держать страницу открытой, создать запуск curl'ом, снапшот через ~5с.

## Gotchas

- Правка backend-исходников перезапускает `nest --watch` → запуск в полёте осиротеет (SQS visibility 7200с). Не диагностировать как баг.
- `pnpm install` ломает живой nuxt dev — не запускать; новые зависимости согласовывать с пользователем.
- После проверки прибрать: удалить e2e-запуски через `DELETE /api/runs/:id` (каскадом чистит S3 и уведомления), сид-доки — через mongosh.
