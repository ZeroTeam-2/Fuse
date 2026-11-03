> Статус задач сверен с кодом на коммите `a80f5172` (03.11.2026). Пункты, которые
> аудит от 30.10 считал открытыми, а новые change'и с тех пор закрыли, снесены или
> переведены в проверку. Значения скомпрометированных секретов в этом файле больше
> не приводятся: они фиксируются хэшами (см. 1.7), сами значения — в канале
> сопровождения.

## 1. Ротация секретов и отвязка от внешней инфраструктуры

Степень утечки у значений разная, и от неё зависит срочность. Целиком в
публичный репозиторий попали два: пароль root MongoDB (64 символа) и
`YANDEX_CLIENT_SECRET` (32 символа). У остальных четырёх утекли только
префиксы — 13, 12, 10 и 8 символов, воспользоваться ими нельзя.

- [x] 1.1 Перевыпущен `JWT_SECRET` (`openssl rand -hex 48`)
- [x] 1.2 Перевыпущен `NUXT_SESSION_SECRET`. Старое значение совпадало с `JWT_SECRET` — одно и то же на подпись токенов и на сессию Nuxt; теперь значения разные
- [x] 1.3 Общий `.env` удалён вместе с кредами внешних сервисов. Рабочий профиль — `.env.local` (локальные Mongo, LocalStack, Garage), внешней инфраструктуры у проекта нет
- [x] 1.4 `nuxt.config.ts` читает `.env.local`, затем `.env` (как `envFilePath` у бэкенда); `.env.example` и `.env.local.example` приведены к локальному профилю
- [x] 1.5 Плейнтекст секретов вычищен из истории git (`git filter-repo --replace-text`), ветки `main` и `develop` перевыпущены
- [ ] 1.6 **Сменить пароль root MongoDB** на внешнем сервере. Утёк целиком вместе с адресом хоста, лежал в публичном репозитории с 19.07.2026 — проверить базу на следы доступа (лишние коллекции, записки о выкупе, объём данных)
- [ ] 1.7 **Перевыпустить `YANDEX_CLIENT_SECRET`** в кабинете OAuth-приложения. Утёк целиком; с парой client_id + secret можно выдавать себя за приложение в OAuth-обмене
- [ ] 1.8 Перевыпустить статический ключ Yandex Message Queue и ключи Timeweb S3 — для гигиены, утекли только префиксы
- [ ] 1.9 Внести sha256 отозванных значений в `apps/backend/src/config/env.schema.ts` и `apps/frontend/config/env.schema.ts`. Сами значения в репозиторий не возвращаются; хэши посчитаны до удаления `.env`:

  | Переменная | sha256 отозванного значения |
  |---|---|
  | `MONGODB_URL` | `ed46c443893b686ff123ba490534dba602cacc32262b35ee263444214a12e3ed` |
  | `AWS_ACCESS_KEY_ID` | `0478a4966e517e2170aa73ecf6639af8a76460907894814aabaa3089505cd92a` |
  | `AWS_SECRET_ACCESS_KEY` | `9093f87aeaa188be5771708ac18f3b213d5e1b18901325f72d1a319e36ae5acf` |
  | `S3_ACCESS_KEY` | `82100458573677ff1c7cf23fa667ddfe1b144a786fbc241364fbe02ca48d7f04` |
  | `S3_SECRET_KEY` | `bcb5442c6837f8de7e65cb748459052c9f0d739e7edfb2b3ac5b6d795e09e387` |
  | `YANDEX_CLIENT_SECRET` | `ba2a655f52a7110c6f6e50b6542583cec6c563ab51ae7648bf406729c60ed9ed` |
  | `JWT_SECRET` / `NUXT_SESSION_SECRET` | `67b10701b534be9b9908f01f2dd1821237bb70189a69eb6199aaa57c4535acdd` |

- [ ] 1.10 Запросить у GitHub Support сборку мусора репозитория — **или сознательно отказаться**. Старые объекты достижимы из 24 рефов `refs/pull/*` (41 коммит с секретом), поэтому сами они не исчезнут никогда. После выполнения 1.6–1.8 это вопрос гигиены, а не безопасности

## 2. Backend — глобальные middleware

- [ ] 2.1 Установить зависимости: `helmet`, `@nestjs/throttler`, `csrf-csrf`, `ipaddr.js`, `file-type`, `undici`
- [ ] 2.2 `app.use(helmet(...))` в `main.ts`; HSTS только при `NODE_ENV=production`
- [ ] 2.3 Лимиты тела запроса: `json({ limit })` и `urlencoded({ limit, extended: true })` в `main.ts`
- [ ] 2.4 **Включить `trust proxy`** у Express (`app.set("trust proxy", <число хопов>)`) и убедиться, что Caddy проставляет `X-Forwarded-For`. Без этого `req.ip` равен адресу контейнера Caddy, и throttler считает всех пользователей одним клиентом
- [ ] 2.5 `ThrottlerModule.forRoot(...)` в `app.module.ts` + `ThrottlerGuard` как `APP_GUARD`
- [ ] 2.6 Строгий `@Throttle` на `/auth/callback`, `/auth/refresh`, `/auth/dev-login`, `/auth/logout` в `auth.controller.ts`
- [ ] 2.7 `@Throttle` на `MarketplaceController` (весь контроллер `@Public()`, включая `:id/manual-inputs`)
- [ ] 2.8 `@Throttle` на `UploadsController`, `UsersController.uploadAvatar` и file-эндпоинты `AppsController`
- [ ] 2.9 Исключить health-check `GET /` из throttle (`@SkipThrottle`) — docker опрашивает его каждые 15 с
- [ ] 2.10 Регистрировать `/api/docs` и `/api/schema.json` только вне production
- [ ] 2.11 `apps/backend/src/common/filters/all-exceptions.filter.ts` + `APP_FILTER`, с идентификатором запроса в теле 5xx
- [ ] 2.12 `apps/backend/src/common/middleware/request-id.middleware.ts` + `AsyncLocalStorage` для проброса идентификатора в логи
- [ ] 2.13 `@Header("Cache-Control", "no-store")` на обработчиках `AuthController`

## 3. Fail-fast валидация секретов

Строгий режим MUST включаться по тому, **на что указывает конфигурация**, а не
по `NODE_ENV`. Ровно этот случай и произошёл: в `.env` стояло
`NODE_ENV=development`, а `MONGODB_URL`, `AWS_*` и `S3_*` смотрели на боевые
Yandex Cloud, Timeweb и внешний Mongo — вместе с непустым
`SSRF_ALLOWED_HOSTS` и включённым локальным входом. Проверка, привязанная к
`NODE_ENV=production`, в таком профиле не сработала бы ни одна.

- [ ] 3.1 Ввести в `env.schema.ts` признак «конфигурация смотрит наружу»: хост считается внешним, если это IP-литерал из публичного диапазона либо доменное имя с точкой вне `localhost`/`.local`. Односегментные имена (`mongo`, `localstack`, `garage` — сервисы compose), приватные диапазоны и `host.docker.internal` считаются локальными
- [ ] 3.2 При внешней конфигурации **или** `NODE_ENV=production` включать строгий режим: отклонять пустые и placeholder-значения `JWT_SECRET`, `NUXT_SESSION_SECRET`, `AWS_*`, `S3_*`, `YANDEX_*`, а также значения с хэшем из списка отозванных (1.9)
- [ ] 3.3 В строгом режиме отклонять непустой `SSRF_ALLOWED_HOSTS` — список обходит и блок-лист, и резолв DNS целиком
- [ ] 3.4 В строгом режиме отклонять непустой `DEV_LOGIN_PASSWORD` (сейчас проверка привязана только к `NODE_ENV=production`)
- [ ] 3.5 Отклонять `JWT_SECRET` с вырожденным алфавитом (один повторяющийся символ) и совпадение `JWT_SECRET` с `NUXT_SESSION_SECRET` — так было до ротации
- [ ] 3.6 Требовать `https://` у непустого `LOG_COLLECTOR_URL`
- [ ] 3.7 Заменить `configService.get<string>("JWT_SECRET") ?? "fallback"` на `getOrThrow` в четырёх местах: `app.module.ts:41`, `auth/auth.module.ts:17`, `auth/strategies/jwt.strategy.ts:20`, `auth/yandex-auth.service.ts:130`
- [ ] 3.8 Проверить: `rg '\?\? "fallback"' apps/backend/src/` — пусто
- [ ] 3.9 В `docker-compose.yml` заменить `:-` на `:?` для `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — **в обоих сервисах, `backend` и `worker`**. `MONGODB_URL`, `JWT_SECRET`, `NUXT_SESSION_SECRET` уже приведены
- [ ] 3.10 Привести `S3_URL: ${S3_URL:-minio}` — дефолт указывает на сервис, которого больше нет (локально Garage, в бою внешний S3)

## 4. Cookie-флаги + CSRF

- [ ] 4.1 `sameSite: "lax"` во всех окружениях в `auth.controller.ts:setAuthCookies` (сейчас `none` в production)
- [ ] 4.2 **`path` оставить `/`.** Сужение до `/api` сломает аутентификацию WebSocket: socket.io живёт на `/socket.io/`, вне глобального префикса, и куку туда браузер не пришлёт
- [ ] 4.3 `logout` → `@Post("logout")`, убрать `@Get("logout")` и `@Public()`
- [ ] 4.4 Вынести объект cookie-опций в одно место и использовать его и в `res.cookie`, и в `res.clearCookie`
- [ ] 4.5 `apps/backend/src/security/csrf.config.ts` — конфигурация `csrf-csrf` (кука `HttpOnly`, парный токен в теле ответа)
- [ ] 4.6 `apps/backend/src/security/csrf.guard.ts` — проверка `x-csrf-token` для `POST`/`PUT`/`PATCH`/`DELETE`
- [ ] 4.7 Зарегистрировать `CsrfGuard` как `APP_GUARD` после `JwtAuthGuard`
- [ ] 4.8 `GET /api/auth/csrf-token` — ставит куку, возвращает парный токен телом
- [ ] 4.9 `apps/backend/src/security/origin.guard.ts` — проверка `Origin`/`Referer` против `APP_URL` для не-GET. **Предусмотреть SSR**: Nuxt-сервер ходит в API без `Origin` (в т.ч. `POST /api/auth/refresh` из `plugins/api.ts`), и правило «нет заголовков → 403» сломает рефреш сессии при рендере. Решение зафиксировать в коде комментарием и покрыть тестом
- [ ] 4.10 На фронтенде хранить CSRF-токен из тела ответа в памяти и подставлять заголовком. **Читать из cookie нельзя** — она `HttpOnly`

## 5. Ротация refresh + OAuth state

- [ ] 5.1 Схема `Session` (`{ jti, userId, refreshTokenHash, createdAt, revokedAt }`) в `apps/backend/src/auth/session.schema.ts`
- [ ] 5.2 `SessionService`: `create`, `validate(jti)`, `revoke(jti)`, `revokeAllForUser(userId)`
- [ ] 5.3 Поле `tokenVersion` в `User`-схеме
- [ ] 5.4 `JwtPayload`: `jti` и `sId` в access-токене, `jti` в refresh-токене
- [ ] 5.5 `issueTokens` в `yandex-auth.service.ts`: генерировать `jti`, сохранять сессию, подписывать access с `sId`. Учесть, что `issueTokens` вызывается и из `devLogin`
- [ ] 5.6 `refreshTokens`: проверить `jti` в `SessionService`, отозвать старый, выдать новый; при повторном использовании отозванного — `revokeAllForUser`
- [ ] 5.7 `JwtStrategy.validate`: проверять сессию по `sId` и `tokenVersion`. Учесть, что `validate` уже ходит в базу за пользователем — не добавлять второй запрос на каждый вызов
- [ ] 5.8 `POST /api/auth/logout-all` — `tokenVersion++` и `revokeAllForUser`
- [ ] 5.9 `getAuthUrl(state?)` уже принимает параметр — начать его передавать: генерировать `state`, класть в короткоживущую httpOnly-куку
- [ ] 5.10 `auth.controller.login()` — ставить куку `oauth_state`; сейчас это `@Redirect()`, понадобится `@Res`
- [ ] 5.11 `auth.controller.callback()` — сверять `state` из query с кукой, затем удалять куку
- [ ] 5.12 Тесты: повтор отозванного refresh → 401; валидная ротация → новая пара; несовпадение `state` → отказ без сессии

## 6. IDOR — проверки владельца

- [ ] 6.1 **Сделано.** `execution.controller.ts` прокидывает `req.user.userId`, `execution.service.getRun` кидает `ForbiddenException`, остальные методы идут через него. Задача сводится к тесту-регрессии (15.4), чтобы инвариант не потерялся
- [ ] 6.2 `uploads.service.findSession(uploadId)` → `findSession(uploadId, userId)` с `ForbiddenException` при чужой сессии
- [ ] 6.3 Прокинуть `req.user.userId` в `uploadPart`, `completeChunkedUpload`, `abortChunkedUpload`, `getUploadStatus` в `uploads.controller.ts` — сейчас ни один из четырёх не смотрит на владельца
- [ ] 6.4 `scenarios.controller.getManualInputs(@Param("id") id)` → прокинуть `req.user.userId`
- [ ] 6.5 `manual-inputs.service.forScenario(scenarioId)` → `forScenario(scenarioId, ownerId)`, `NotFoundException` для чужого. Гостевой путь не трогать: он идёт через `marketplace.service.getManualInputs`, где уже проверяется `published`
- [ ] 6.6 Убрать `email` из `UpdateProfileDto` (`apps/backend/src/users/dto/update-profile.dto.ts`)
- [ ] 6.7 Убрать `published` из `UpdateScenarioDto` — сейчас `scenarios.service.update` пишет `$set: { ...dto }` и публикует мимо проверок `togglePublish`
- [ ] 6.8 Убрать `openapiUrl` из `UpdateAppDto`
- [ ] 6.9 Тесты на каждый случай: владелец → 200, чужой → 403/404

## 7. Аутентификация WebSocket

- [ ] 7.1 Вынести извлечение и проверку JWT из handshake в общее место. **Готовый образец уже есть** — `NotificationsGateway.authenticate` (`apps/backend/src/notifications/notifications.gateway.ts`): читает `access_token` из `handshake.headers.cookie`, проверяет через `JwtService`. Переиспользовать, а не писать заново
- [ ] 7.2 `RunGateway.handleConnection`: отключать сокет без валидного токена. Сейчас проверок нет вовсе — комната определяется `runId` из query
- [ ] 7.3 Проверять формат `runId`, загружать `Run`, сверять `run.userId` с `userId` из токена; иначе `disconnect`
- [ ] 7.4 `WebSocketModule` понадобится `JwtModule` (как у `NotificationsGatewayModule`) — проверить, что токен проверяется тем же секретом
- [ ] 7.5 Снапшот в `sendSnapshot` отдавать уже обрезанным по `error` (см. 11.2); `consts` в снапшот не попадают — `stepResults` их не содержат
- [ ] 7.6 Тесты: без куки → disconnect; чужой `runId` → disconnect; свой `runId` → снапшот

## 8. SSRF

- [ ] 8.1 Заменить `PRIVATE_IPV4_PATTERNS` в `apps/backend/src/apps/ssrf-guard.ts` на разбор через `ipaddr.js` (RFC 6890: loopback, private, link-local, ULA, CGNAT, multicast)
- [ ] 8.2 Блокировать IP-литералы в нестандартных записях (decimal, octal, hex, IPv4-mapped IPv6)
- [ ] 8.3 `apps/backend/src/apps/safe-fetch.ts`: `undici.Agent` с кастомным `lookup`, который резолвит один раз, валидирует и пиннит адрес. Сейчас между `assertPublicHostname` и `fetch` окно для подмены
- [ ] 8.4 `redirect: "manual"` вместо `follow` в `ssrf-guard.fetchSpec` и в вызовах `worker.service` (строки 653 и 837): каждый `Location` прогонять через ту же проверку
- [ ] 8.5 `openapi-parser.ts:91` — `dereference(rawSpec, { dereference: { external: false } })`
- [ ] 8.6 `spec-text-parser.ts` — `load(text, { schema: JSON_SCHEMA })`. **Важно:** `JSON_SCHEMA` ограничивает теги, но **не отключает алиасы** — у js-yaml нет такой опции, а `load` в версии 4 и так безопасен по тегам. От billion-laughs защищают лимит размера входа и явный отказ разбирать документ с алиасами; при необходимости — переход на пакет `yaml` с `maxAliasCount`
- [ ] 8.7 Тесты: `169.254.169.254`, decimal-запись, IPv4-mapped IPv6, подмена DNS между проверкой и соединением, редирект на приватный адрес

## 9. Загрузки файлов

- [ ] 9.1 `users.controller.ts:51` — `FileInterceptor("file", { limits: { fileSize, files: 1 } })` + проверка сигнатуры содержимого через `file-type`, allowlist PNG/JPEG/WebP, запрет SVG. Сейчас единственная проверка — `file.mimetype.startsWith("image/")` по значению от клиента
- [ ] 9.2 `uploads.controller.ts:43` — те же `limits` для `singleUpload`
- [ ] 9.3 `apps.controller.ts` — те же `limits` на **всех четырёх** file-эндпоинтах (строки 107, 151, 206, 240); `validateSpecFile` сейчас смотрит только на расширение имени
- [ ] 9.4 `uploads.controller.uploadPart` — ограничить размер читаемого тела. Сейчас обработчик вчитывает весь поток запроса в массив буферов без верхней границы
- [ ] 9.5 `uploads.service` — валидировать `partNumber` в допустимом диапазоне и ограничить число частей исходя из `session.fileSize`
- [ ] 9.6 `minio.service.uploadFile` — метаданные `Content-Disposition: attachment` и `X-Content-Type-Options: nosniff`
- [ ] 9.7 **Перед** сокращением TTL presigned-ссылок развязать хранение от ссылки: `users.service.updateAvatar` сохраняет в `avatarUrl` готовый presigned URL (`users.controller.ts:65`), и с коротким TTL аватары отвалятся навсегда. Хранить `avatarObjectId`, ссылку выпускать на чтение профиля
- [ ] 9.8 Проверить тот же эффект у `uploads.singleUpload` и `completeChunkedUpload`: обе возвращают клиенту presigned URL, который может быть сохранён в данных шага
- [ ] 9.9 Только после 9.7–9.8 — сократить TTL `presignedGetObject` в `minio.service.ts:88` с 24 часов
- [ ] 9.10 `GET /api/uploads/:id/url` — выпуск свежей ссылки по требованию (auth + владелец)

## 10. Фронтенд

- [ ] 10.1 Установить `isomorphic-dompurify` и модуль безопасности Nuxt
- [ ] 10.2 Переписать `apps/frontend/utils/sanitizeRichText.ts` на парсерный санитайзер. Потребители: `renderMarkdown.ts` (блоки страниц шага) и `pages/cards/[id]/index.vue` — оба рендерят через `v-html`
- [ ] 10.3 Подключить CSP. **С nonce или хэшами**: Nuxt встраивает инлайновый скрипт состояния гидрации, и `script-src 'self'` без nonce положит все SSR-страницы
- [ ] 10.4 Убрать `loadEnv({ path: resolve(rootDir, "../../.env") })` из `nuxt.config.ts` — сборка читает боевой `.env`
- [ ] 10.5 Nitro-плагин, роняющий сервер при сборочном плейсхолдере в `runtimeConfig.sessionSecret`
- [ ] 10.6 Решить по Яндекс.Метрике (вопрос Q5): оставить ручной сниппет с allowlist в CSP либо перевести на `@nuxt/scripts`
- [ ] 10.7 В `apps/frontend/plugins/api.ts` — allowlist имён пересылаемых cookie (сейчас заголовок `cookie` уходит в бэкенд целиком)
- [ ] 10.8 ~~Переписать `forwardSetCookiesToBrowser` через `cookie.serialize`~~ — **снято.** Функция пробрасывает `Set-Cookie` от бэкенда как есть, атрибуты сохраняются; переписывание отняло бы у бэкенда контроль над флагами
- [ ] 10.9 Тест: разметка со скриптом в описании карточки не исполняется после санитайза
- [ ] 10.10 Тест: нарушение CSP фиксируется при попытке подгрузить сторонний скрипт

## 11. Логи и санитизация ответов

- [ ] 11.1 Подключить `LoggingService` как логгер приложения (`app.useLogger`) — **сейчас он не используется нигде**, вся запись идёт через `Logger` из `@nestjs/common`, и redactor внутри неподключённого сервиса ничего не закроет. Затем добавить маскирование email, полей с токенами и JWT-подобных строк
- [ ] 11.2 `worker.service.ts` — обрезать тело ошибки стороннего API перед записью в `stepResults[].error` и `run.error`; полный текст в лог
- [ ] 11.3 `worker.service.ts:165` — валидировать `runId` из тела сообщения до `findById`: сейчас невалидное значение даёт `CastError` в обработчике и уходит на повторную доставку
- [ ] 11.4 `marketplace.service.getCard` — вырезать `consts` из шагов и `blockedReason` из ответа. **`steps` оставить**: по ним рисуются панель запуска и playground для гостя (см. комментарий в `marketplace.service.ts:25` и требование в спеке `marketplace`)
- [ ] 11.5 Экранировать `query.search` перед подстановкой в `$regex` — в `getCatalog` и в `getCategoryCounts`
- [ ] 11.6 Тест: патологический паттерн в поиске не приводит к зависанию

## 12. Контейнеры

- [ ] 12.1 `apps/backend/Dockerfile` — непривилегированный пользователь, `COPY --chown`, `USER` перед `CMD`, корректная доставка `SIGTERM`. Образ общий для `backend` и `worker`
- [ ] 12.2 То же для `apps/frontend/Dockerfile`
- [ ] 12.3 То же для `apps/proxy/Dockerfile` (`USER caddy`)
- [ ] 12.4 В `docker-compose.yml` для **всех четырёх** сервисов (`caddy`, `backend`, `worker`, `frontend`): `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `read_only: true` + `tmpfs`, лимиты памяти/CPU/`pids_limit`. Лимит памяти воркера считать от `WORKER_CONCURRENCY`
- [ ] 12.5 В `docker-compose.dev.yml` забиндить на `127.0.0.1` порты `mongo` (27018), `localstack` (4566), `garage` (9000), `mock-api` (8085)
- [ ] 12.6 Пин образов по digest там, где сейчас теги: `mongo:7`, `localstack/localstack:4.7.0`, `dxflrs/garage:v2.5.0`, `mccutchen/go-httpbin:v2.15.0`, `caddy:2-alpine`, `node:24-alpine`
- [ ] 12.7 Заменить `npm install -g pnpm@9` в обоих Dockerfile на corepack с версией из `packageManager` (`pnpm@10.4.1`) — сейчас образы собираются не тем pnpm, которым проверяется лок
- [ ] 12.8 Дополнить `.dockerignore`: `.env.local`, `.env.*.local`, `.claude/`, `.cursor/`, `.opencode/`, `.turbo/`, `**/test`, `**/e2e`, `scripts/`, `*.md`. `docs`, `openspec`, `.env`, `node_modules` и артефакты сборки уже есть

## 13. Caddy

- [ ] 13.1 Перевести `:8081` на `https://<домен>` с ACME (домен уточнить у ops, вопрос Q3)
- [ ] 13.2 Блок `header`: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- [ ] 13.3 Проставлять `X-Forwarded-For` / `X-Forwarded-Proto` — от них зависит `trust proxy` (2.4) и, значит, весь rate-limiting
- [ ] 13.4 Перевыпустить OAuth `redirect_uri` на HTTPS-origin — иначе вход сломается в момент выкатки TLS
- [ ] 13.5 Решить по edge-лимитам: модуль `caddy-ratelimit` или CDN перед прокси
- [ ] 13.6 Порты и capability: если Caddy слушает 80/443, оставить `NET_BIND_SERVICE` при `cap_drop: [ALL]`

## 14. CI/CD

Change-флоу на GitHub Actions больше не используется, и дальше проект уезжает
на GitLab CI. Поэтому укреплять `change-bootstrap.yml` и `change-complete.yml`
незачем — их надо удалить. Это закрывает и shell-инъекцию через имя ветки, и
сам долгоживущий токен, одним действием вместо четырёх.

- [ ] 14.1 Удалить `.github/workflows/change-bootstrap.yml` и `.github/workflows/change-complete.yml`
- [ ] 14.2 **Отозвать PAT `FLOW_TOKEN`** в настройках токенов аккаунта и удалить одноимённый секрет репозитория. Токен с правами на issues и pull requests живёт там без потребителя
- [ ] 14.3 Решить судьбу `ci.yml` и `spec-gate.yml` вместе с переездом на GitLab CI: либо перенести проверки (lint, typecheck, тесты, гейт спеки), либо удалить вслед за остальными
- [ ] 14.4 Пока GitHub Actions остаются живыми — добавить `permissions: contents: read` в `ci.yml` (в `spec-gate.yml` блок уже есть)
- [ ] 14.5 Перенести в новый пайплайн гейты, которых сейчас нет нигде: поиск секретов, аудит зависимостей, сканирование образов
- [ ] 14.6 `pnpm.overrides` в корневом `package.json` для транзитивных `multer` (из `@nestjs/platform-express`, сейчас 2.1.1) и `tar`. Прямые зависимости уже подняты: backend объявляет `multer@^2.2.0`, в локе есть `tar@7.5.19`
- [ ] 14.7 `pnpm install` для обновления лока
- [ ] 14.8 В оставшихся GitHub-workflow закрепить `uses:` по commit SHA с комментарием версии
- [ ] 14.9 Заменить `cp .env.example .env` в пайплайне на явный блок переменных окружения

## 15. Тесты и регрессионные гейты

- [ ] 15.1 Юнит-тесты на новые guard'ы: CSRF, Origin (включая SSR-случай без `Origin`), handshake WebSocket
- [ ] 15.2 Кросс-origin `POST` отклоняется
- [ ] 15.3 State-changing запрос без CSRF-токена отклоняется
- [ ] 15.4 Регрессия на IDOR запусков: `POST /api/runs/<чужой>/cancel` → 403 (поведение уже есть, тест его фиксирует)
- [ ] 15.5 IDOR на чанковой загрузке: чужой `uploadId` → 403
- [ ] 15.6 WebSocket без куки → disconnect; с чужим `runId` → disconnect
- [ ] 15.7 SSRF: `169.254.169.254` и нестандартные записи адреса отклоняются
- [ ] 15.8 External `$ref` не резолвится
- [ ] 15.9 SVG-аватар отклоняется; PNG с подменённым расширением проходит по сигнатуре
- [ ] 15.10 Маскирование в логах: email и токены
- [ ] 15.11 Старт в production с placeholder `JWT_SECRET` падает; старт вне production с дефолтами — нет
- [ ] 15.12 Старт в production с непустым `SSRF_ALLOWED_HOSTS` падает
- [ ] 15.13 Поиск по маркетплейсу с патологическим паттерном не вешает запрос

## 16. Документация и ops

- [ ] 16.1 `.env.example`: инструкции-плейсхолдеры для `JWT_SECRET` и `NUXT_SESSION_SECRET`
- [ ] 16.2 Раздел «Безопасность» в `README.md`: обязательные переменные и процедура ротации
- [ ] 16.3 `docs/security/ci-migration.md` — переход с PAT на GitHub App
- [ ] 16.4 `docs/security/incident-response.md` — ротация скомпрометированных секретов, включая переписывание истории
- [ ] 16.5 Проверить итоговые заголовки staging внешним чекером

## 17. Smoke и финальная проверка

- [ ] 17.1 Вход через Яндекс работает с `SameSite=Lax`, `state` и CSRF-токеном
- [ ] 17.2 Локальный вход работает и держит строгий лимит
- [ ] 17.3 Чанковая загрузка работает с проверкой владельца
- [ ] 17.4 WebSocket-прогресс виден владельцу и только ему; реконнект работает
- [ ] 17.5 `/api/docs` отдаёт 404 в production
- [ ] 17.6 Security-заголовки присутствуют на ответах
- [ ] 17.7 Контейнеры запускаются не от root (`docker exec <c> id`), включая реплику воркера
- [ ] 17.8 Dev-инфраструктура доступна только с localhost
- [ ] 17.9 `rg 'fallback|change-me' apps/backend/src/` — пусто
- [ ] 17.10 Аудит зависимостей без high/critical
- [ ] 17.11 `openspec validate harden-security-posture --strict` проходит
