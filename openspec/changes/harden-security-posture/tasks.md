## 1. Аварийная ротация секретов (T+0, до кода)

- [ ] 1.1 Сгенерировать новый `JWT_SECRET` через `openssl rand -hex 48` и обновить во всех окружениях (dev/staging/prod, `.env`, vault)
- [ ] 1.2 Сгенерировать новый `NUXT_SESSION_SECRET` через `openssl rand -hex 48` и обновить во всех окружениях
- [ ] 1.3 Ротировать MongoDB root-credentials (старый `CGQvwCwNlfuBmx9hAEqP8mI9l1hhlGsY7kqVGmgaYFdr8pKCx0y6ureINbE9B3f9` считать скомпрометированным)
- [ ] 1.4 Перевыдать Yandex SQS static keys (`YCAJEyEeIlw_9...`/`YCO6yfa_b3vG...` считать скомпрометированными)
- [ ] 1.5 Перевыдать Timeweb S3 keys (`QWRUNM50IQ...`/`CBKwGy7r...` считать скомпрометированными)
- [ ] 1.6 Перевыдать Yandex OAuth client secret (`d414df45ab82440f9ed041ed87d76f81` считать скомпрометированным) и обновить `YANDEX_CLIENT_SECRET`
- [ ] 1.7 Зафиксировать скомпрометированные значения в `apps/backend/src/config/env.schema.ts` через `.refine` (reject blacklist literal strings)
- [ ] 1.8 Зафиксировать скомпрометированные значения в `apps/frontend/config/env.schema.ts` через `.refine` для `NUXT_SESSION_SECRET`

## 2. Backend hardening — глобальные middleware

- [ ] 2.1 Установить зависимости: `helmet`, `@nestjs/throttler`, `csrf-csrf`, `ipaddr.js`, `file-type`, `undici`
- [ ] 2.2 В `apps/backend/src/main.ts` подключить `app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" }, ... }))`, с условным пропуском HSTS в dev
- [ ] 2.3 Установить `app.use(json({ limit: "1mb" }))` и `urlencoded({ limit: "1mb", extended: true })` в `main.ts`
- [ ] 2.4 Зарегистрировать `ThrottlerModule.forRoot(...)` в `app.module.ts` и `APP_GUARD` `ThrottlerGuard`
- [ ] 2.5 Добавить `@Throttle({ default: { limit: 5, ttl: 60_000 } })` на `/auth/*` эндпоинты в `auth.controller.ts`
- [ ] 2.6 Добавить `@Throttle({ default: { limit: 30, ttl: 60_000 } })` на `MarketplaceController`
- [ ] 2.7 Добавить `@Throttle({ default: { limit: 10, ttl: 60_000 } })` на `UploadsController` и `UsersController.uploadAvatar`
- [ ] 2.8 Обернуть `/api/docs` и `/api/schema.json` в `main.ts` в `if (process.env.NODE_ENV !== "production")`
- [ ] 2.9 Создать `apps/backend/src/common/filters/all-exceptions.filter.ts`, зарегистрировать как `APP_FILTER`, с correlation UUID в 5xx ответах
- [ ] 2.10 Создать `apps/backend/src/common/middleware/correlation-id.middleware.ts`, добавляющий `x-request-id` в request/response, использовать `AsyncLocalStorage` для проброса в `LoggingService`
- [ ] 2.11 Добавить `@Header("Cache-Control", "no-store")` на все обработчики `AuthController`

## 3. Fail-fast валидация секретов

- [ ] 3.1 В `apps/backend/src/config/env.schema.ts` удалить `.default("test")`/`.default("minioadmin")`/`.default("")` для всех секретов; сделать их `z.string().min(N)`
- [ ] 3.2 Добавить `.refine` на `JWT_SECRET`: reject `change-me-...`, `fallback`, и Shannon entropy < 3.0
- [ ] 3.3 Добавить `.refine` на `LOG_COLLECTOR_URL`: требовать `https://`
- [ ] 3.4 В `app.module.ts` заменить `configService.get<string>("JWT_SECRET") ?? "fallback"` на `configService.getOrThrow<string>("JWT_SECRET")`
- [ ] 3.5 В `apps/backend/src/auth/auth.module.ts` заменить фолбэк-секрет на `getOrThrow`
- [ ] 3.6 В `apps/backend/src/auth/strategies/jwt.strategy.ts` заменить фолбэк-секрет на `getOrThrow`
- [ ] 3.7 В `apps/backend/src/auth/yandex-auth.service.ts` заменить фолбэк-секрет на `getOrThrow`
- [ ] 3.8 В `docker-compose.yml` заменить `${VAR:-default}` на `${VAR:?required}` для всех секретов (JWT_SECRET, NUXT_SESSION_SECRET, MONGODB_URL, AWS_*, S3_*, YANDEX_*)
- [ ] 3.9 Проверить `rg '\?\? "fallback"' apps/backend/src/` — ни одного совпадения

## 4. Cookie-флаги + CSRF

- [ ] 4.1 В `apps/backend/src/auth/auth.controller.ts` сменить `sameSite: isProd ? "none" : "lax"` на `sameSite: "lax"` во всех окружениях
- [ ] 4.2 Установить `path: "/api"` для всех auth-кук
- [ ] 4.3 Изменить `logout` на `@Post("logout")` (удалить `@Get("logout")`); убрать `@Public()` (требовать auth)
- [ ] 4.4 В `setAuthCookies` и `logout` использовать один и тот же объект cookie-опций для `clearCookie`
- [ ] 4.5 Установить `csrf-csrf` библиотеку; создать `apps/backend/src/security/csrf.config.ts` с конфигурацией double-submit token cookie
- [ ] 4.6 Создать `apps/backend/src/security/csrf.guard.ts`, проверяющий заголовок `x-csrf-token` против cookie для всех non-GET/state-changing запросов
- [ ] 4.7 Зарегистрировать CsrfGuard как `APP_GUARD` (после JwtAuthGuard)
- [ ] 4.8 Добавить `GET /api/auth/csrf-token` эндпоинт (auth-required), возвращающий свежий CSRF-токен
- [ ] 4.9 Создать `apps/backend/src/security/origin.guard.ts`, проверяющий `Origin`/`Referer` против `APP_URL` для всех non-GET; зарегистрировать как `APP_GUARD`
- [ ] 4.10 На frontend обновить `$fetch`/`useFetch` плагины в `apps/frontend/plugins/api.ts`: автоматически добавлять `x-csrf-token` из cookie на каждый state-changing запрос

## 5. Аутентификация — ротация refresh + OAuth state

- [ ] 5.1 Создать Mongoose-схему `Session` (`{ jti, userId, refreshTokenHash, createdAt, revokedAt }`) в `apps/backend/src/auth/session.schema.ts`
- [ ] 5.2 Создать `SessionService` с методами `create`, `validate(jti)`, `revoke(jti)`, `revokeAllForUser(userId)`
- [ ] 5.3 Добавить поле `tokenVersion` в `User`-схему; инкрементировать при password change / "logout everywhere"
- [ ] 5.4 Обновить `JwtPayload`: добавить `jti` и `sId` для access-токена, `jti` для refresh-токена
- [ ] 5.5 Переписать `issueTokens` в `yandex-auth.service.ts`: генерировать `jti`, сохранять session, подписывать access с `sId`, refresh с `jti`
- [ ] 5.6 Переписать `refreshTokens`: верифицировать refresh, проверить валидность `jti` в `SessionService`, при валидности — отозвать старый `jti`, выдать новый; при инвалидности (повтор) — отозвать всю цепочку (`revokeAllForUser`)
- [ ] 5.7 Обновить `JwtStrategy.validate`: проверить `SessionService.validate(sId)` и опционально `tokenVersion`
- [ ] 5.8 Добавить `POST /api/auth/logout-all` (инвалидирует все сессии пользователя через `tokenVersion++` и `revokeAllForUser`)
- [ ] 5.9 В `yandex-auth.service.getAuthUrl()` генерировать `state = crypto.randomUUID()`, сохранять в short-lived httpOnly cookie `oauth_state` (через controller), передавать в Yandex URL
- [ ] 5.10 В `auth.controller.login()` устанавливать `oauth_state` cookie и возвращать URL с state
- [ ] 5.11 В `auth.controller.callback()` сверять `req.query.state` с cookie `oauth_state`; при несовпадении — `400`; после сверки удалять cookie
- [ ] 5.12 Юнит-тесты: replay старого refresh-токена → 401; валидная ротация → 200 с новой парой; несовпадение state → 400

## 6. IDOR — ownership-чеки

- [ ] 6.1 В `execution.controller.ts` прокинуть `@Req() req` в `cancel/submitPage/submitInputs` и передать `req.user.userId` в сервис
- [ ] 6.2 В `execution.service.ts` обновить сигнатуры `cancelRun(runId, userId)`, `submitPageData(runId, stepIndex, data, userId)`, `submitInputs(runId, stepIndex, values, userId)`; добавить ownership-check через `run.userId !== userId` → `ForbiddenException`
- [ ] 6.3 В `uploads.service.ts` обновить `findSession(uploadId, userId)`: добавить `userId` параметр, выбрасывать `ForbiddenException` при `session.userId !== userId`
- [ ] 6.4 Обновить `uploadPart`, `completeChunkedUpload`, `abortChunkedUpload`, `getUploadStatus` в `uploads.controller.ts`: прокидывать `req.user.userId`
- [ ] 6.5 В `scenarios.controller.ts` обновить `getManualInputs`: прокинуть `req.user.userId`
- [ ] 6.6 В `manual-inputs.service.ts` обновить `forScenario(scenarioId, userId)`: возвращать данные только если `scenario.ownerId === userId` ИЛИ `scenario.published === true`; иначе `NotFoundException` (не раскрывать существование)
- [ ] 6.7 Юнит-тесты для каждого IDOR-сценария: владелец → 200, чужой → 403/404

## 7. WebSocket-аутентификация

- [ ] 7.1 Создать `apps/backend/src/websocket/socket-jwt.guard.ts` с извлечением токена из `handshake.auth.token` или `handshake.headers.cookie`
- [ ] 7.2 В `run.gateway.ts` реализовать `handleConnection`: верифицировать JWT, при отсутствии/невалидности — `client.disconnect()` с reason `unauthorized`
- [ ] 7.3 После верификации загрузить `Run` по `runId` из `handshake.query.runId`; проверить `run.userId === decoded.userId`; иначе `client.disconnect()` с reason `forbidden`
- [ ] 7.4 Валидировать формат `runId` (regex `/^[a-f\d]{24}$/`) перед `join`
- [ ] 7.5 Передавать в `sendSnapshot` только sanitized данные (без длинных upstream error bodies, без `consts`)
- [ ] 7.6 E2e-тест: клиент без auth-куки отключается; клиент с auth, но чужим `runId` отключается; клиент с правильным `runId` получает снапшот

## 8. SSRF — hardening

- [ ] 8.1 Установить `ipaddr.js` (если ещё нет)
- [ ] 8.2 В `apps/backend/src/apps/ssrf-guard.ts` заменить regex-проверку на `ipaddr.js.parse(addr)` + `range === "private"` (включает RFC 6890: loopback, private, link-local, ULA fc00::/7, CGNAT 100.64.0.0/10, metadata 169.254/16, multicast)
- [ ] 8.3 Блокировать любой IP-литерал в hostname (decimal/octal/hex/IPv4-mapped IPv6 как `[::ffff:127.0.0.1]`)
- [ ] 8.4 Создать `apps/backend/src/apps/safe-fetch.ts` с `undici.Agent({ connect: { lookup: customLookup } })`, где `customLookup` резолвит DNS один раз, валидирует IP через `assertSafeIp`, и возвращает тот же IP для всех retries
- [ ] 8.5 В `worker.service.ts` использовать `fetch(url, { dispatcher: safeAgent, redirect: "manual" })`; обрабатывать 3xx вручную с повторной валидацией SSRF для каждого redirect-target
- [ ] 8.6 В `apps/backend/src/apps/openapi-parser.ts` вызывать `dereference(rawSpec, { dereference: { external: false } })` для запрета external `$ref`
- [ ] 8.7 В `apps/backend/src/apps/dto/update-app.dto.ts` удалить поле `openapiUrl` (миграция только через DELETE+POST)
- [ ] 8.8 В `apps/backend/src/apps/spec-text-parser.ts` использовать `load(text, { schema: JSON_SCHEMA, json: true })` для запрета YAML anchors
- [ ] 8.9 Юнит-тесты: `169.254.169.254` блокируется; decimal `2130706433` блокируется; `[::ffff:127.0.0.1]` блокируется; DNS rebinding отклоняется через pinned IP

## 9. Загрузки — magic-bytes + размеры

- [ ] 9.1 Установить `file-type` (если ещё нет)
- [ ] 9.2 В `apps/backend/src/users/users.controller.ts` обновить `uploadAvatar`: `FileInterceptor("file", { limits: { fileSize: 5*1024*1024, files: 1 } })`; валидация через `fileTypeFromBuffer(file.buffer)` — allowlist PNG/JPEG/WebP, запрет SVG
- [ ] 9.3 В `uploads.controller.ts` обновить `singleUpload`: `FileInterceptor("file", { limits: { fileSize: maxSingleBytes, files: 1 } })`
- [ ] 9.4 В `uploads.controller.ts` для `uploadPart`: добавить ограничение размера тела (через `express.raw({ limit: "8mb", type: "*/*" })` route-interceptor или length-checker stream)
- [ ] 9.5 В `uploads.service.ts` валидировать `partNumber ∈ [1, 10000]`; кап `parts.length` на основе `session.fileSize / MIN_PART_SIZE`
- [ ] 9.6 В `minio.service.ts` при `uploadFile` передавать metadata `{ "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff" }`
- [ ] 9.7 В `minio.service.ts` сократить TTL `presignedGetObject` с `24*60*60` до `15*60` (15 минут)
- [ ] 9.8 Создать `GET /api/uploads/:id/url` эндпоинт (auth + ownership-check), возвращающий свежий presigned URL по требованию
- [ ] 9.9 В `apps.controller.ts` `validateSpecFile`: добавить sniffing по контенту (JSON.parse или `js-yaml` failure), а не только по расширению

## 10. Frontend hardening

- [ ] 10.1 Установить `isomorphic-dompurify` и `nuxt-security`
- [ ] 10.2 Переписать `apps/frontend/utils/sanitizeRichText.ts` на `DOMPurify.sanitize(html, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [] })`
- [ ] 10.3 В `apps/frontend/nuxt.config.ts` подключить `nuxt-security` module с CSP, HSTS, XFO, XCTO, Referrer-Policy
- [ ] 10.4 Удалить `loadEnv({ path: resolve(rootDir, "../../.env") })` из `nuxt.config.ts`; использовать только `.env.example` на build time или `process.env` из runtime
- [ ] 10.5 Добавить Nitro server plugin, падающий при `runtimeConfig.sessionSecret === "build-time-placeholder-0123456789abcdef"`
- [ ] 10.6 Установить `@nuxt/scripts` и заменить hand-rolled `apps/frontend/plugins/metrica.ts` на его Yandex Metrica wrapper (с SRI)
- [ ] 10.7 В `apps/frontend/plugins/api.ts` добавить allowlist для пересылаемых cookie (`access_token`, `refresh_token`, `csrf-token`)
- [ ] 10.8 В `apps/frontend/plugins/api.ts` переписать `forwardSetCookiesToBrowser` на использование `cookie.serialize` с явными hardened атрибутами
- [ ] 10.9 E2e-тест на `pages/cards/[id]/index.vue`: SVG с `<script>` не выполняется после санитайза
- [ ] 10.10 E2e-тест: CSP violation observable при инъекции стороннего `<script>` (через browser console)

## 11. Логирование и санитизация ответов

- [ ] 11.1 В `apps/backend/src/logging/logging.service.ts` добавить redactor: emails → `a***@b.com`, поля `password`/`secret`/`token`/`refreshToken`/`accessToken` → `[REDACTED]`, JWT-паттерны → маска
- [ ] 11.2 В `worker.service.ts` обрезать `upstream error body` до 200 символов перед записью в `stepResults[].error` (полный текст в логи)
- [ ] 11.3 В `worker.service.ts` валидировать `runId` из SQS-сообщения через regex `/^[a-f\d]{24}$/`; невалидные → ack + DLQ
- [ ] 11.4 В `marketplace.service.ts` спроектировать `MarketplaceScenarioPublicDto`, исключающий `consts`, `blockedReason`, внутренние `appId`/`endpointId` шагов
- [ ] 11.5 В `marketplace.service.ts` экранировать `query.search` перед передачей в `$regex` (или переключить на `$text` с индексом)
- [ ] 11.6 Юнит-тест: паттерн `(a+)+$` не вызывает зависание (> 1с)

## 12. Container hardening

- [ ] 12.1 В `apps/backend/Dockerfile`: `RUN addgroup -S app && adduser -S app -G app`, `USER app` перед CMD, `COPY --chown=app:app`, `ENTRYPOINT ["/sbin/tini","--"]`, `RUN apk add --no-cache tini`
- [ ] 12.2 Аналогично для `apps/frontend/Dockerfile`
- [ ] 12.3 Аналогично для `apps/proxy/Dockerfile` (использовать `USER caddy`)
- [ ] 12.4 В `docker-compose.yml` для каждого сервиса: `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `read_only: true` + `tmpfs: ["/tmp:noexec,nosuid,size=64m"]`, `mem_limit: 1g`, `cpus: "1.5"`, `pids_limit: 200`
- [ ] 12.5 В `docker-compose.dev.yml` забиндить все порты dev-инфраструктуры (mongo, minio, localstack, mock-api) на `127.0.0.1:HOST:CONTAINER`
- [ ] 12.6 В `docker-compose.dev.yml` заменить `image: minio/minio:latest` и `minio/mc:latest` на pin по digest (`@sha256:...`)
- [ ] 12.7 В `apps/backend/Dockerfile` и `apps/frontend/Dockerfile` заменить `npm install -g pnpm@9` на corepack-пин точной версии (или pin `pnpm@9.18.0`)
- [ ] 12.8 Расширить `.dockerignore`: добавить `.env*` (кроме `.env.example`), `.claude/`, `.cursor/`, `.opencode/`, `.turbo/`, `**/test`, `**/e2e`, `docs/`, `openspec/`, `scripts/`, `*.md`, `LICENSE`

## 13. Caddy — TLS + security headers

- [ ] 13.1 В `Caddyfile` заменить `:8081 { ... }` на `https://<production-domain> { tls <email>; ... }` (домен уточнить у ops)
- [ ] 13.2 Добавить `header` блок в Caddyfile: HSTS (`max-age=63072000; includeSubDomains; preload`), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy
- [ ] 13.3 Добавить CSP в Caddy (если `nuxt-security` не покрывает edge)
- [ ] 13.4 Установить `caddy-ratelimit` module (или front CDN) для ограничения `/api/auth/*` (5 req/min per-IP)
- [ ] 13.5 В `apps/proxy/Dockerfile` убедиться, что Caddy слушает на 80/443, а контейнер запускается с `cap_add: [NET_BIND_SERVICE]` (остальное `cap_drop`)

## 14. CI/CD hardening

- [ ] 14.1 Удалить секрет `FLOW_TOKEN` из GitHub repo settings
- [ ] 14.2 Создать GitHub App с минимальными правами (Issues RW, Pull Requests RW, Contents Read) и зарегистрировать как secret-переменную `APP_ID`/`APP_PRIVATE_KEY`
- [ ] 14.3 В `change-bootstrap.yml` и `change-complete.yml` заменить `GH_TOKEN: ${{ secrets.FLOW_TOKEN }}` на `gh auth login` через GitHub App (через `tibdex/github-app-token` action)
- [ ] 14.4 В `change-bootstrap.yml` и `change-complete.yml` валидировать `${ID}` через regex `^[a-z0-9-]{1,40}$` перед использованием в shell-командах
- [ ] 14.5 В `change-complete.yml` добавить `if: github.event.pull_request.head_repo.full_name == github.repository` для блокировки fork-PR
- [ ] 14.6 В `ci.yml` добавить `permissions: contents: read`
- [ ] 14.7 Создать `gitleaks.yml` workflow, запускающий `gitleaks/gitleaks-action` на pull_request
- [ ] 14.8 В `ci.yml` добавить job `pnpm-audit` с `pnpm audit --prod --audit-level=high`
- [ ] 14.9 Создать `trivy.yml` workflow, сканирующий repo и собранные Docker-образы через `aquasecurity/trivy-action`
- [ ] 14.10 В `package.json` (root) добавить `pnpm.overrides`: `"tar": "^7.5.16"`, `"multer": "^2.2.0"`
- [ ] 14.11 Запустить `pnpm install` для обновления `pnpm-lock.yaml`
- [ ] 14.12 Pin все `uses:` в `.github/workflows/*.yml` по полному commit SHA (с комментарием версии)
- [ ] 14.13 В `ci.yml` заменить `cp .env.example .env` на явные env vars в `env:` блоке (отдельные от `.env.example`)

## 15. Тесты и regression gates

- [ ] 15.1 Юнит-тесты на каждый новый guard (CsrfGuard, OriginGuard, SocketJwtGuard, ThrottlerModule)
- [ ] 15.2 E2e-тест: cross-origin POST с `Origin: https://evil.com` отклоняется с 403
- [ ] 15.3 E2e-тест: state-changing запрос без `x-csrf-token` отклоняется с 403
- [ ] 15.4 E2e-тест: IDOR на `/api/runs/<other>/cancel` возвращает 403
- [ ] 15.5 E2e-тест: WebSocket без auth-куки disconnect с `unauthorized`
- [ ] 15.6 E2e-тест: SSRF на `http://169.254.169.254` в `/api/apps/from-url` отклоняется
- [ ] 15.7 E2e-тест: external `$ref` в OpenAPI import не резолвится
- [ ] 15.8 E2e-тест: загрузка SVG аватара отклоняется с 400
- [ ] 15.9 Юнит-тест на `redactPii` в `LoggingService`: email и токены маскируются
- [ ] 15.10 Юнит-тест: приложение падает при старте с placeholder JWT_SECRET
- [ ] 15.11 Юнит-тест: `marketplace search` с патологическим regex не вызывает зависание

## 16. Документация и ops-runbook

- [ ] 16.1 Обновить `.env.example` с правильными placeholder-инструкциями (`<generate via openssl rand -hex 48>`) для JWT_SECRET и NUXT_SESSION_SECRET
- [ ] 16.2 Обновить `README.md` секцией "Security" с описанием mandatory env vars и процедурой ротации
- [ ] 16.3 Зафиксировать процедуру OIDC → GitHub App миграции в `docs/security/ci-migration.md`
- [ ] 16.4 Добавить runbook "How to rotate compromised secrets" в `docs/security/incident-response.md`
- [ ] 16.5 Прогнать production staging через https://securityheaders.com/?q=<staging-url> — должна быть оценка A+

## 17. Smoke и финальная валидация

- [ ] 17.1 Smoke: энд-ту-эндый OAuth login работает с SameSite=Lax и CSRF-токеном
- [ ] 17.2 Smoke: чанковая загрузка работает с ownership-чеками
- [ ] 17.3 Smoke: WebSocket-прогресс выполнения сценария виден только владельцу
- [ ] 17.4 Smoke: `/api/docs` возвращает 404 в production
- [ ] 17.5 Smoke: `helmet` headers присутствуют на всех ответах (curl -I)
- [ ] 17.6 Smoke: контейнеры запускаются non-root (`docker exec <c> id` → `uid=100(app)`)
- [ ] 17.7 Smoke: dev-инфра `mongo`/`minio` доступны только с localhost
- [ ] 17.8 Review: прогнать `rg 'fallback|\?\? "test"|change-me' apps/backend/src/` — ни одного совпадения
- [ ] 17.9 Review: прогнать `pnpm audit --prod --audit-level=high` — нет high/critical CVE
- [ ] 17.10 Финальная проверка статуса change: `openspec validate harden-security-posture --strict`
