## ADDED Requirements

### Requirement: Helmet на backend
Система SHALL подключать `helmet()` middleware на backend со следующими директивами: `Strict-Transport-Security` (max-age ≥ 63072000, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off`, `X-Download-Options: noopen`.

#### Scenario: Headers присутствуют на каждом ответе
- **WHEN** клиент делает любой HTTP-запрос к backend
- **THEN** ответ содержит все перечисленные security-заголовки с корректными значениями

#### Scenario: HSTS только в production
- **WHEN** backend запущен в `NODE_ENV=development`
- **THEN** заголовок `Strict-Transport-Security` не добавляется (чтобы не сломать localhost HTTP)

### Requirement: Cache-Control на auth-ответах
Система SHALL добавлять заголовок `Cache-Control: no-store` на все ответы auth-эндпоинтов (`/api/auth/*`).

#### Scenario: Login ответ не кэшируется
- **WHEN** клиент получает `200 OK` от `/api/auth/callback`
- **THEN** ответ содержит `Cache-Control: no-store`

### Requirement: Security headers в Caddy
Caddyfile SHALL содержать глобальный `header` блок с `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (`geolocation=(), microphone=(), camera=()`). Caddy MUST терминировать TLS (ACME) для production-домена.

#### Scenario: TLS в production
- **WHEN** клиент обращается к production origin по HTTP
- **THEN** Caddy редиректит на HTTPS (301) и терминирует TLS с валидным сертификатом

#### Scenario: Security headers проходят через прокси
- **WHEN** клиент делает запрос к frontend или API через Caddy
- **THEN** финальный ответ содержит все security-заголовки из header-блока

### Requirement: CSP на frontend
Frontend SHALL устанавливать `Content-Security-Policy` через `nuxt-security` (или Nitro `routeRules`). Базовая CSP MUST быть: `default-src 'self'; script-src 'self' https://mc.yandex.ru; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss: ws:; frame-ancestors 'none'; base-uri 'self'`.

#### Scenario: Блокировка inline script
- **WHEN** на странице frontend пытается выполниться `<script>alert(1)</script>` (не из allowlist)
- **THEN** браузер блокирует выполнение и логирует violation в console

#### Scenario: Loading Yandex Metrica
- **WHEN** страница загружает `https://mc.yandex.ru/metrika/tag.js`
- **THEN** скрипт загружается без CSP violation (входит в `script-src`)

### Requirement: Скрытие Swagger в production
Система SHALL регистрировать эндпоинты `/api/docs` и `/api/schema.json` только при `NODE_ENV !== 'production'`. В production эти маршруты MUST возвращать `404`.

#### Scenario: Production без Swagger
- **WHEN** клиент запрашивает `/api/docs` на production-инстансе
- **THEN** система отвечает `404 Not Found`

#### Scenario: Dev со Swagger
- **WHEN** клиент запрашивает `/api/docs` на dev-инстансе
- **THEN** система отдаёт Scalar API reference UI
