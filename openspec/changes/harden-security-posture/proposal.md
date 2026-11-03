## Why

Аудит безопасности Fuse (30.10.2026) прошёл по всем слоям — backend, frontend, инфраструктура — и нашёл дефекты, которые нельзя оставлять до публичного запуска: CSRF при cookie-аутентификации с `SameSite=None` в production, IDOR на загрузках и на ручных входах сценария, отсутствие rate-limiting и security-заголовков, обходимую защиту от SSRF (DNS rebinding, внешние `$ref`), регекс-санитайзер HTML, фолбэк-секрет `"fallback"` для подписи JWT, открытый наружу Swagger, боевые креды в `.env` и в артефактах самого change'а.

Состав изменения сверен с кодом на коммите `a80f5172` (03.11.2026). За время между аудитом и сверкой в main влились семь change'ей, и часть выводов аудита устарела:

- **IDOR на эндпоинтах выполнения закрыт** — `execution.controller` прокидывает владельца, `getRun` отбивает чужой запуск. Остаётся регрессионный тест.
- **Воркер вынесен в отдельный процесс**, события идут через мост поверх MongoDB. Hardening контейнеров и ограничения ресурсов должны покрывать сервис `worker`, которого в момент аудита не было.
- **MinIO заменён на Garage**, Yandex SQS — на SQS-совместимый профиль с `AWS_*`. Задачи про `minio/minio:latest` и имена переменных Yandex потеряли адресата.
- **Появился локальный вход по паролю** (`POST /api/auth/dev-login`, `@Public()`) — новая неаутентифицированная точка, которой в аудите нет.
- **Появился `SSRF_ALLOWED_HOSTS`** — список исключений, обходящий и блок-лист, и резолв DNS.
- **Публичность шагов опубликованного сценария зафиксирована как продуктовое решение** (панель запуска и playground для гостя), поэтому «срезать `steps`» из маркетплейса больше не цель — цель точнее: вырезать `consts` и `blockedReason`.
- **`multer` и `tar` уже подняты** в прямых зависимостях; остаются транзитивные вхождения.

## What Changes

**Аутентификация и сессии**
- **BREAKING**: `sameSite: 'none'` → `'lax'` для auth-кук в production; `logout` становится `POST`. `path` остаётся `/` — сужение до `/api` отрезало бы куку от handshake socket.io.
- Защита CSRF: парный токен (кука `HttpOnly` + заголовок `x-csrf-token`, плоское значение выдаётся телом ответа) и проверка `Origin` для методов, меняющих состояние — с исключением для серверных вызовов Nuxt при SSR.
- Убрать фолбэк `?? "fallback"` для `JWT_SECRET` в четырёх местах, перейти на `getOrThrow`.
- Ротация refresh-токенов с `jti` и серверным хранилищем сессий; `tokenVersion` для «выйти везде».
- OAuth `state`: генерация, привязка к куке, сверка в callback (`getAuthUrl` уже принимает параметр).
- Строгий лимит частоты на `/auth/dev-login`, `/auth/refresh`, `/auth/callback`, `/auth/logout`.

**Авторизация**
- Проверка владельца в `uploads.findSession` и во всех четырёх чанковых эндпоинтах.
- Проверка владельца на `GET /api/scenarios/:id/manual-inputs` (гостевой путь остаётся через маркетплейс).
- Аутентификация handshake WebSocket в `RunGateway` с проверкой владельца запуска — по образцу уже работающего `NotificationsGateway`.
- Убрать из DTO поля, которыми обходятся проверки: `email` из `UpdateProfileDto`, `published` из `UpdateScenarioDto`, `openapiUrl` из `UpdateAppDto`.

**SSRF**
- Разбор адреса через `ipaddr.js` (RFC 6890) вместо списка регулярных выражений; блокировка нестандартных записей IPv4 и IPv4-mapped IPv6.
- Пиннинг адреса на соединение (кастомный `lookup` диспетчера) — закрывает окно между проверкой и `fetch`.
- `redirect: "manual"` с повторной проверкой каждого `Location`.
- Запрет внешних `$ref` при dereference спецификации.
- Запрет непустого `SSRF_ALLOWED_HOSTS` в production.

**Лимиты и заголовки**
- `ThrottlerGuard` как `APP_GUARD` + **`trust proxy` у Express**: без него `req.ip` равен адресу контейнера Caddy и все пользователи считаются одним клиентом.
- `helmet()`, лимиты тела запроса, `Cache-Control: no-store` на auth-ответах.
- Swagger и `/api/schema.json` только вне production.
- Глобальный фильтр исключений: 5xx без диагностики, с идентификатором запроса.

**Валидация и загрузки**
- `limits: { fileSize, files: 1 }` на всех шести точках приёма файлов (аватар, single-upload, четыре эндпоинта спецификаций); проверка аватара по сигнатуре содержимого, запрет SVG.
- Верхняя граница на тело `uploadPart` и валидация номера части.
- Развязать хранение аватара от presigned-ссылки **до** сокращения TTL — иначе аватары отвалятся навсегда.
- Парсерный санитайзер вместо регекс-санитайзера в `sanitizeRichText` (его потребители — `renderMarkdown` и страница карточки).

**Инфраструктура и секреты**
- **BREAKING**: ротация всех скомпрометированных кредов; отозванные значения отклоняются валидацией **по хэшу**, чтобы не возвращать их в репозиторий.
- Fail-fast на секреты, обусловленный `NODE_ENV=production` — дефолты для LocalStack и Garage остаются, иначе локальная разработка встанет.
- `${VAR:?}` для оставшихся секретов в compose, в обоих сервисах (`backend` и `worker`).
- Непривилегированный пользователь в контейнерах, `cap_drop`, `read_only`, лимиты ресурсов — включая `worker`.
- Dev-инфраструктура (`mongo`, `localstack`, `garage`, `mock-api`) слушает только `127.0.0.1`.
- TLS в Caddy, security-заголовки, `X-Forwarded-For`; перевыпуск OAuth `redirect_uri` на HTTPS.
- CSP на фронтенде **с nonce** — `script-src 'self'` без nonce ломает гидрацию Nuxt.
- GitHub App вместо `FLOW_TOKEN`; устранение подстановки имени ветки в shell; `permissions` в `ci.yml`; поиск секретов, аудит зависимостей и сканирование образов в CI; пин actions по SHA.
- `pnpm.overrides` для транзитивных `multer` и `tar`; corepack с версией pnpm из `packageManager`.
- Вычистить плейнтекст секретов из истории git.

## Capabilities

### New Capabilities
- `security-rate-limiting`: ограничение частоты запросов с корректным ключом клиента за прокси.
- `security-csrf-protection`: парный CSRF-токен, проверка `Origin`, ужесточение атрибутов кук.
- `security-headers`: единый набор security-заголовков (backend, Caddy, CSP фронтенда).
- `security-secrets-management`: отказ стартовать с незаполненными и отозванными секретами, изоляция от контекста сборки.
- `container-hardening`: непривилегированный рантайм, минимальные привилегии, лимиты ресурсов, воспроизводимые образы.
- `supply-chain-security`: гейты CI (секреты, зависимости, образы), короткоживущие токены, закреплённые actions.
- `audit-logging-sanitization`: маскирование в логах, идентификатор запроса, обрезка тел ответов, глобальный фильтр исключений.

### Modified Capabilities
- `auth-profile`: атрибуты кук, ротация refresh, OAuth `state`, immutable email, `POST`-logout, лимит на локальный вход, аватар по имени объекта.
- `marketplace`: вырезание `consts` и `blockedReason` из публичного ответа (шаги остаются), экранирование поиска.
- `scenario-execution`: аутентификация WebSocket-комнаты, SSRF с пиннингом адреса, обрезка ошибок, валидация сообщения очереди, фиксация проверки владельца.
- `scenario-builder`: границы размера шагов, запрет публикации через `PATCH`, владельческий `manual-inputs`.
- `api-app-management`: запрет внешних `$ref`, лимиты на приём файлов спецификации, уточнение роли схемы YAML.

## Impact

**Код**
- `apps/backend/src/main.ts`, `app.module.ts` — helmet, throttler, `trust proxy`, лимиты тела, фильтр исключений, Swagger по окружению.
- `apps/backend/src/auth/` — CSRF, OAuth `state`, ротация refresh, атрибуты кук, `POST`-logout, `getOrThrow`.
- `apps/backend/src/{execution,uploads,scenarios,apps,users,websocket,marketplace,notifications}/` — проверки владельца, валидация, санитизация.
- `apps/backend/src/config/env.schema.ts`, `apps/frontend/config/env.schema.ts` — fail-fast, список отозванных хэшей.
- `apps/frontend/utils/sanitizeRichText.ts`, `plugins/api.ts`, `nuxt.config.ts` — санитайзер, allowlist кук, CSP, отказ от чтения общего `.env`.

**Инфраструктура**
- `Caddyfile` — TLS, заголовки, `X-Forwarded-For`.
- `docker-compose.yml` — привилегии, лимиты, `:?` для оставшихся секретов (включая `worker`).
- `docker-compose.dev.yml` — bind на `127.0.0.1`, пин по digest.
- `apps/{backend,frontend,proxy}/Dockerfile` — непривилегированный пользователь, corepack, сигналы.
- `.dockerignore`, `.github/workflows/*.yml`.

**Зависимости**
- Добавить: `helmet`, `@nestjs/throttler`, `csrf-csrf`, `ipaddr.js`, `file-type`, `undici`, `isomorphic-dompurify`, модуль безопасности Nuxt.
- `pnpm.overrides` для транзитивных `multer` и `tar`.

**Операционные последствия**
- **BREAKING**: все сессии инвалидируются (смена `JWT_SECRET` и атрибутов кук).
- **BREAKING**: production не стартует без заполненных секретов и с непустым `SSRF_ALLOWED_HOSTS`.
- Требуется перевыпуск OAuth `redirect_uri` на HTTPS и ротация внешних кредов.
- Переписывание истории git потребует перeклонирования репозитория у всех, у кого есть локальные копии.
