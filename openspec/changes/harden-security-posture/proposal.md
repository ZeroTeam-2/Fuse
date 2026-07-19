## Why

Комплексный аудит безопасности Fuse выявил **17 критических**, **25 высоких** и **более 25 средних/низких** уязвимостей во всех слоях приложения (backend, frontend, инфраструктура). Текущая реализация уязвима к CSRF (cookie-auth + `SameSite=None` в проде), IDOR на эндпоинтах выполнения и загрузок, отсутствию rate-limiting и helmet, сломанной защите от SSRF, регекс-санитайзеру XSS, захардкоженным секретам и выставленному наружу Swagger UI. Устранение этих дефектов критично до любого публичного запуска — иначе возможны массовый захват аккаунтов, утечка данных пользователей и компрометация инфраструктуры Yandex Cloud / Timeweb.

## What Changes

**Аутентификация и сессии**
- **BREAKING**: Сменить `sameSite: 'none'` → `'lax'` для auth-кук в проде; сделать logout методом `POST`.
- Внедрить защиту CSRF (double-submit токен через `csrf-csrf`) для всех state-changing эндпоинтов.
- Убрать фолбэк `?? "fallback"` для `JWT_SECRET`; использовать `configService.getOrThrow` и `.refine` против захардкоженных placeholder-строк.
- Добавить ротацию refresh-токенов с `jti` и server-side session store; добавлять `tokenVersion` в access-токен с bump при logout-everywhere.
- Реализовать OAuth `state`-параметр (генерация, cookie-bound, валидация в callback).

**Авторизация (IDOR)**
- Прокинуть `req.user.userId` в `execution.cancelRun/submitPageData/submitInputs` с проверкой владельца.
- Проверять владельца в `uploads.findSession(uploadId, userId)` и во всех chunked-upload эндпоинтах.
- Проверять ownership/published для `scenarios/:id/manual-inputs`.
- Аутентифицировать WebSocket-подключения (`RunGateway.handleConnection`) с проверкой `run.userId === decoded.userId`.
- Убрать `email` из `UpdateProfileDto`; запретить `published` через generic PATCH (только через `togglePublish`).

**SSRF**
- Использовать `ipaddr.js` (RFC 6890) в `SsrfGuard`, блокировать decimal/octal/hex/IPv4-mapped IPv6; pin IP через кастомный `dns.lookup` (undici Agent) для устранения DNS-rebinding.
- Запретить external `$ref` dereference в `@readme/openapi-parser` (`{ dereference: { external: false } }`).
- Срезать `openapiUrl` из `UpdateAppDto` (миграция только через пересоздание).

**Rate Limiting & Headers**
- Установить `@nestjs/throttler` как `APP_GUARD`; строгие лимиты на `/auth/*`, `/marketplace`, `/uploads/*`.
- Подключить `helmet()`; `Cache-Control: no-store` на auth-ответах.
- Спрятать Swagger/`/api/schema.json` за `NODE_ENV !== 'production'`.
- Глобальный `AllExceptionsFilter` — срезать детали 5xx в ответах.

**Валидация и загрузки**
- `FileInterceptor("file", { limits: { fileSize, files: 1 } })` везде; проверка по magic-bytes через `file-type` (запрет SVG для аватаров); `Content-Disposition: attachment` на загружаемые объекты.
- Валидировать `partNumber` ∈ 1..10000; cap размера `parts[]`.
- Парсить `js-yaml` со схемой `JSON_SCHEMA` (запрет anchors).
- Заменять regex-санитайзер `sanitizeRichText` на `isomorphic-dompurify` (parser-based).

**Инфраструктура и секреты**
- **BREAKING**: Ротировать **все** скомпрометированные креды в `.env` (MongoDB root, Yandex SQS, Timeweb S3, Yandex OAuth secret, JWT/session секреты); вынести в Vault/Doppler/sops.
- Удалить `.default("test"/"minioadmin")` в `env.schema.ts`; заменить `${VAR:-default}` → `${VAR:?required}` в `docker-compose.yml`.
- Запустить контейнеры от non-root `USER`; добавить `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `read_only: true`, resource limits.
- Bind dev-инфраструктуру (mongo/minio/localstack/mock-api) на `127.0.0.1`.
- Включить TLS в Caddy (ACME) и добавить security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- CSP на frontend через `nuxt-security` или Nitro `routeRules`.
- Заменить `FLOW_TOKEN` PAT на GitHub App + OIDC; валидировать имя change-ветки через regex; добавить `permissions: contents: read` в `ci.yml`; блокировать fork-PR в `change-complete`.
- Добавить SAST (Gitleaks), Trivy (image + repo scan), `pnpm audit --audit-level=high` в CI.
- Bump `multer` до `>=2.2.0` и `tar` до `>=7.5.16` через `pnpm.overrides`.
- Сократить expiry presigned-URL с 24h до 5–15 минут; добавить on-demand endpoint.
- Срезать публичное раскрытие полных `steps`/`consts`/`blockedReason` в marketplace.

## Capabilities

### New Capabilities
- `security-rate-limiting`: Throttling входящих HTTP-запросов на уровне приложения (per-IP + per-route), с особыми лимитами для auth/marketplace/uploads.
- `security-csrf-protection`: Защита state-changing эндпоинтов от CSRF (double-submit token, Origin/Referer checks, SameSite ужесточение).
- `security-headers`: Унифицированный набор security response headers (helmet на backend, Caddy headers, CSP на frontend).
- `security-secrets-management`: Политика хранения/валидации секретов (no placeholders, fail-fast валидация, изоляция от build-context).
- `container-hardening`: Non-root runtime, least-privilege capabilities, read-only FS, resource limits, pinned digests.
- `supply-chain-security`: CI-гейты для SAST, dependency audit, image scanning, pinning, OIDC вместо PAT.
- `audit-logging-sanitization`: Санитизация PII и upstream error bodies в логах/ответах, глобальный exception filter.

### Modified Capabilities
- `auth-profile`: Ужесточение cookie-флагов, ротация refresh-токенов, валидность OAuth `state`, запрет смены email через PATCH, logout = POST.
- `marketplace`: Срезание `consts`/`steps`/`blockedReason` из публичного ответа, экранирование `$regex`-поиска от ReDoS.
- `scenario-execution`: Проверка ownership на cancel/page-submit/input-submit, санитизация ошибок worker, валидация SQS-сообщений.
- `scenario-builder`: Валидация структуры `steps`, запрет `published` через generic PATCH, ownership-чек на manual-inputs.
- `api-app-management`: Запрет mutation `openapiUrl`, отключение external `$ref` dereference, размеры файла + YAML-схема.

## Impact

**Код**
- `apps/backend/src/main.ts`, `app.module.ts` — helmet, throttler, global filter, JSON body limit.
- `apps/backend/src/auth/` — CSRF, OAuth state, refresh rotation, cookie-флаги, logout=POST, JWT factory.
- `apps/backend/src/execution/`, `uploads/`, `scenarios/`, `apps/`, `users/`, `websocket/` — IDOR-чеки, валидация, sanitization.
- `apps/frontend/utils/sanitizeRichText.ts`, `pages/cards/[id]/index.vue` — DOMPurify.
- `apps/frontend/nuxt.config.ts` — CSP, security headers, отказ от загрузки `.env` в build.
- `apps/frontend/plugins/{api,metrica}.ts` — allowlist cookie forwarding, замена metrica на `@nuxt/scripts`.

**Инфраструктура**
- `Caddyfile` — TLS, security headers, rate-limit module.
- `docker-compose.yml`, `docker-compose.dev.yml` — `127.0.0.1` bind, resource limits, `:?required`.
- `apps/{backend,frontend,proxy}/Dockerfile` — non-root USER, tini, digest pinning.
- `.dockerignore` — расширить исключения (`.env*`, `.claude`, `.opencode`, тесты).
- `.github/workflows/*.yml` — OIDC, permissions, SAST/Trivy/audit шаги, branch-name validation.

**Зависимости**
- Добавить: `helmet`, `@nestjs/throttler`, `csrf-csrf`, `ipaddr.js`, `file-type`, `isomorphic-dompurify`, `@nuxt/scripts`, `nuxt-security`.
- Обновить: `multer` (≥2.2.0), `tar` (≥7.5.16 через overrides).
- Удалить: hand-rolled `metrica.ts` snippet.

**Операционные последствия**
- **BREAKING**: Все существующие сессии инвалидируются (смена JWT secret + cookie flags).
- **BREAKING**: Dev-инстансы вне localhost больше не запустятся без явного override.
- Требуется ротация внешних секретов (Yandex/Timeweb/Mongo) и перевыдача OAuth redirect URI на HTTPS.
