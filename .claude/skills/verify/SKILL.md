---
name: verify
description: Как проверить изменение Fuse вживую — headless (curl+JWT) и в браузере (chrome-devtools MCP) против живых dev-серверов
---

# Проверка Fuse вживую

Dev-серверы поднимает пользователь (не убивать его процессы): бэкенд `nest --watch` на :3001 (сам подхватывает правки), фронтенд `nuxt dev` на :5173. Инфра — `pnpm infra` (docker: `fuse-mongo` :27018, `fuse-localstack` SQS :4566, `fuse-garage` S3 :9000). Профиль `.env.local` перекрывает `.env`.

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
5. **S3 (Garage):** шелла и `mc` в образе нет, только бинарь `garage`. Сводка по бакету — `docker exec fuse-garage /garage bucket info fuse` (число объектов, размер, права ключа). Для операций над конкретным объектом — клиент `minio` из репозитория, запуск из `apps/backend`:
   ```bash
   node -e "const {Client}=require('minio');const c=new Client({endPoint:'localhost',port:9000,useSSL:false,accessKey:'minioadmin',secretKey:'fuse-local-dev-secret'});(async()=>{for await(const o of c.listObjects('fuse','uploads/',true))console.log(o.name,o.size);})()"
   ```
   Ошибки видно в `docker logs fuse-garage`: `403 Forbidden: Invalid signature` означает расхождение `S3_SECRET_KEY` между бэкендом и контейнером.

## Браузер (chrome-devtools MCP)

- Ошибка «browser is already running» → это осиротевший Chrome ПРОШЛОЙ MCP-сессии на профиле `C:\Users\user\.cache\chrome-devtools-mcp\chrome-profile`; убедиться по CommandLine и убить только эти процессы — пользовательского браузера не касается.
- Авторизация: открыть `http://localhost:5173`, `evaluate_script` → `document.cookie = "access_token=<jwt>; path=/"` (кука с :5173 уходит и на :3001 — порты куки не различают), затем навигация на приватную страницу.
- Реалтайм проверяется так: держать страницу открытой, создать запуск curl'ом, снапшот через ~5с.

## Gotchas

- Правка backend-исходников перезапускает `nest --watch` → запуск в полёте осиротеет (SQS visibility 7200с). Не диагностировать как баг.
- `nest --watch` НЕ следит за `.env.local` и `.env`: после правки env-файла живой бэкенд продолжает работать со старыми значениями, и симптом выглядит как поломка кода (например, 500 на загрузке файла при верном конфиге). Перезапуск нужен принудительный, причём обновления mtime мало — tsc сравнивает содержимое, так что нужна реальная правка исходника (и откат её через `git checkout --`).
- `pnpm install` ломает живой nuxt dev — не запускать; новые зависимости согласовывать с пользователем.
- После проверки прибрать: удалить e2e-запуски через `DELETE /api/runs/:id` (каскадом чистит S3 и уведомления), сид-доки — через mongosh.
