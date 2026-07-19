## Context

Fuse — NestJS + NuxtJS монорепо с MongoDB, MinIO, AWS SQS, Socket.IO и Yandex OAuth. Аудит кода, конфигов и инфраструктуры выявил критические уязвимости: CSRF (cookie-auth + `SameSite=None` в проде), IDOR на 6 группах эндпоинтов, отсутствие rate-limiting/helmet/CSP, регекс-санитайзер XSS, сломанная SSRF-защита (DNS rebinding + external `$ref` dereference), захардкоженные секреты и публично доступный Swagger. Сейчас проект готовится к публичному запуску, поэтому нужна комплексная программа исправления до релиза.

Стек: NestJS 11 (ValidationPipe whitelist, JwtAuthGuard как APP_GUARD), passport-jwt, mongoose 8, socket.io 4, multer 2.1.1 (CVE), `@readme/openapi-parser`, Nuxt 3, Caddy 2 reverse proxy, docker-compose (dev/prod), GitHub Actions CI.

## Goals / Non-Goals

**Goals:**
- Закрыть **все 17 критических** и **25 высоких** уязвимостей из аудита до публичного запуска.
- Внедрить защиту-in-depth: helmet + CSP + throttle + non-root контейнеры + SAST в CI.
- Зафиксировать в коде архитектурные инварианты (ownership-чеки в сервисном слое, валидация на уровне DTO, fail-fast на секреты).
- Сделать процесс воспроизводимым: тесты на каждый класс уязвимостей, regression-gates в CI.

**Non-Goals:**
- Полный переход на asymmetric JWT (RS256/ES256) — оставлен как roadmap после стабилизации HS256 с ротацией.
- WAF/Cloudflare-фронт — обсуждается отдельно с ops; в этом change фиксируем только прикладные слои.
- Перенос аутентификации с кук на Bearer-header (CSRF-иммунитет) — слишком инвазивно; вместо этого делаем CSRF-токен + SameSite=Lax.
- Audit log pipeline (SIEM) — отдельная инициатива; здесь только санитизация PII.
- Рефакторинг Yandex OAuth на OpenID Connect — теперь не требуется, хватает `state`+PKCE-like nonce.

## Decisions

### D1. Cookie-флаги + SameSite вместо перехода на Bearer-header
**Решение:** `sameSite: 'lax'` (вместо текущего `'none'` в проде), `secure: true` в проде, `httpOnly: true`, `path: '/api'`.
**Альтернативы:** (a) `SameSite=Strict` — ломает OAuth callback с топ-уровневой навигацией; (b) переход на `Authorization: Bearer` — иммунитет к CSRF, но требует хранения токена в JS и создаёт XSS-риск.
**Why:** SPA и API живут на одном origin (через Caddy), поэтому Lax достаточен и не ломает login flow.

### D2. CSRF — double-submit cookie token через `csrf-csrf`
**Решение:** Библиотека `csrf-csrf` (production-ready, поддерживает cookie-based SPA). Выдаёт `csrf-token` cookie + expects `x-csrf-token` header на каждом state-changing запросе. Дополнительно: глобальный guard, проверяющий `Origin`/`Referer` для non-GET.
**Альтернативы:** (a) synchronizer token в server-side session — требует session store; (b) SameSite-only — недостаточно для top-level GET CSRF (login CSRF).
**Why:** Не требует session storage, совместим с stateless JWT, хорошо ложится на Nest guard.

### D3. Refresh-token rotation с Redis-less session store
**Решение:** Коллекция `sessions` в MongoDB (`{ jti, userId, refreshTokenHash, createdAt, revokedAt }`). При `refreshTokens()` инвалидируем старый jti и выдаём новый. Access-токен получает поле `sId` (session id), проверяемое в `JwtStrategy`. Logout инвалидирует все (или текущую) сессии.
**Why:** Без ротации украденный refresh-токен живёт 7 дней. Redis не используем — уже есть MongoDB, не плодим инфраструктуру. `tokenVersion` для mass-invalidation при password change / "logout everywhere".
**Trade-off:** Latency на каждый запрос + 1 Mongo-lookup (можно кэшировать in-memory с TTL 60s).

### D4. OAuth `state` — генерация + cookie-bound валидация
**Решение:** В `GET /api/auth/login` генерируем `crypto.randomUUID()`, кладём в короткоживущую (10 мин) httpOnly cookie `oauth_state` и передаём в URL Yandex. В `callback` сверяем `state` из query с cookie, после чего удаляем cookie.
**Why:** Login CSRF — реальный вектор при отсутствии state.

### D5. IDOR — единый ownership-check в сервисном слое
**Решение:** Все методы, принимающие идентификатор ресурса (runId, uploadId, scenarioId, appId), MUST принимать `userId` и явно выбрасывать `ForbiddenException` при `resource.userId !== userId`. Контроллеры прокидывают `req.user.userId` (включая `@Param`-параметры). Для WS — тот же чек в `handleConnection` после верификации JWT из `handshake.headers.cookie` или `handshake.auth.token`.
**Why:** Лучше один паттерн, чем ad-hoc guards на каждый эндпоинт.

### D6. SSRF — `ipaddr.js` + DNS-pinning через undici Agent
**Решение:**
1. `SsrfGuard` использует `ipaddr.js.parse()` + `range === 'private'` (RFC 6890 покрывает ULA, link-local, CGNAT, loopback, metadata IP `169.254.169.254`).
2. Блокируем любой IP-литерал в hostname (decimal/octal/hex/IPv4-mapped IPv6).
3. Создаём `undici.Agent({ connect: { lookup: customLookup } })`, где `customLookup` резолвит DNS один раз, проверяет IP, и возвращает тот же IP (pinning) для всех connection-attempts. Передаём agent в `fetch(url, { dispatcher: agent })`.
4. `@readme/openapi-parser.dereference()` вызываем с `{ dereference: { external: false } }`.
**Альтернативы:** Запретить fetch external URLs в принципе — слишком жёстко, ломает user-supplied `openapiUrl`.
**Why:** TOCTOU DNS rebinding — единственный надёжный класс обходов regex-based guard.

### D7. Helmet + body-parser limits + throttler как глобальные middleware
**Решение:**
- `app.use(helmet())` со строгим конфигом (включая `crossOriginResourcePolicy: { policy: 'same-origin' }`).
- `app.use(json({ limit: '1mb' }))`, `urlencoded({ limit: '1mb' })`.
- `ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }] })`, зарегистрированный как `APP_GUARD`.
- Per-route `@Throttle`: `/auth/*` — 5/мин, `/marketplace` — 30/мин, `/uploads/*` — 10/мин.
**Why:** Просто, стандартно, нулевая инвазия в бизнес-логику.

### D8. Swagger за `NODE_ENV !== 'production'`
**Решение:** Регистрируем `/api/docs` и `/api/schema.json` только в dev/staging. В проде — basic-auth gate для админов (опционально).
**Why:** Docs = reconnaissance gold.

### D9. Глобальный `AllExceptionsFilter`
**Решение:** `APP_FILTER` перехватывает всё. Для `HttpException` прокидывает статус и санкционированный message. Для прочих — логирует stack server-side, отвечает клиенту `500 Internal Server Error` с correlation UUID.
**Why:** Предотвращает утечку DB-конфигов, путей файловой системы и upstream error bodies.

### D10. Frontend — `isomorphic-dompurify` + `nuxt-security` + замена metrica
**Решение:**
1. `sanitizeRichText` переписать на `DOMPurify.sanitize(html, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [] })` — парсер-based, иммунитет к mXSS.
2. `nuxt-security` module даёт CSP + standard headers. CSP: `default-src 'self'; script-src 'self' https://mc.yandex.ru; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss: ws:; frame-ancestors 'none'; base-uri 'self'`.
3. Yandex Metrica — заменить hand-rolled snippet на `@nuxt/scripts` (SRI, consent, Partytown).
**Why:** CSP + DOMPurify = комбинированная защита от XSS, без которой cookie-auth бесполезен.

### D11. Файлы — magic-bytes + жёсткие multer limits
**Решение:**
- `FileInterceptor("file", { limits: { fileSize: 5*1024*1024, files: 1, fields: 10 } })` на всех upload-эндпоинтах (avatar/single/chunked-part).
- Валидация через `file-type` (первые 4100 байт) — доверяем только magic-bytes, не mimetype.
- Allowlist: PNG/JPEG/WebP для аватаров; PNG/JPEG/WebP/PDF/JSON/YAML для OpenAPI-спеков.
- Запрет SVG (stored XSS через `<script>`).
- При upload в MinIO передаём `Content-Disposition: attachment` и `X-Content-Type-Options: nosniff` в metadata.
**Why:** Mimetype тривиально спуфить; magic-bytes — нет.

### D12. Presigned URLs — короткий TTL + on-demand endpoint
**Решение:** Снижаем expiry с 24h до 15 минут. Добавляем `GET /api/uploads/:id/url` (auth + ownership-check), который mint-ит свежий URL по требованию.
**Why:** 24h URL в логах/кэшах = постоянная утечка.

### D13. YAML — запрет anchors и external refs
**Решение:** `js-yaml.load(text, { schema: JSON_SCHEMA, json: true })` (отключает anchors/aliases, убирает billion-laughs).
**Why:** Парсер OpenAPI-spec от пользователей = вектор DoS/RCE.

### D14. Секреты — fail-fast + zero-defaults
**Решение:**
- В `env.schema.ts` удаляем все `.default("test")`/`.default("minioadmin")`. Все секреты — `z.string().min(N)`.
- `JWT_SECRET` получает `.refine(v => v !== "change-me-..." && !v.startsWith("fallback"))`.
- В коде везде `configService.getOrThrow<string>("JWT_SECRET")`.
- `.env.example` содержит `JWT_SECRET=<generate-via-openssl-rand-hex-48>` (placeholder, не валидный).
- В `docker-compose.yml` все секреты через `${VAR:?required}`.
**Why:** Любая захардкоженная строка в коде = утечка.

### D15. Контейнеры — non-root + least privilege
**Решение:** Для каждого Dockerfile (backend, frontend, proxy):
- `RUN addgroup -S app && adduser -S app -G app`
- `COPY --chown=app:app ...`
- `USER app` перед `ENTRYPOINT`
- `ENTRYPOINT ["/sbin/tini","--"]` (PID 1, zombie reaping)
- В compose: `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `read_only: true` (где позволяет NestJS — tmpfs `/tmp`), `mem_limit: 1g`, `cpus: "1.5"`, `pids_limit: 200`.
**Why:** Стандарт container hardening.

### D16. Caddy — TLS + headers + rate-limit
**Решение:**
- Меняем `:8081 { ... }` на `https://<domain> { tls <email>; ... }` с ACME.
- Добавляем `header` блок: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP.
- Устанавливаем `caddy-ratelimit` module (или фронтируем CDN): лимит `/api/auth/*` 5/мин per-IP.
**Why:** Edge-level защита дешевле, чем app-level.

### D17. CI — OIDC, SAST, audit, branch validation
**Решение:**
- Удаляем `FLOW_TOKEN` PAT; мигрируем на GitHub App с OIDC.
- В `change-bootstrap.yml` и `change-complete.yml` валидируем `${ID}` через regex `^[a-z0-9-]{1,40}$` перед любым `gh`-вызовом.
- В `ci.yml` добавляем `permissions: contents: read`, блокировку fork-PR в `change-complete` через `if: github.event.pull_request.head_repo.full_name == github.repository`.
- Добавляем jobs: `gitleaks/gitleaks-action`, `aquasecurity/trivy-action` (repo + image), `pnpm audit --prod --audit-level=high`.
- `pnpm.overrides`: `"tar": "^7.5.16"`, `"multer": "^2.2.0"`.
**Why:** CI = ранняя линия обороны.

### D18. Logging sanitization + Correlation IDs
**Решение:**
- В `LoggingService` добавляем redactor: маскируем emails (`a***@b.com`), JWT-паттерны, `password`/`secret`/`token` поля в JSON-логах.
- В `worker.service.ts` обрезаем upstream error body до 200 символов перед сохранением в `stepResults[].error`.
- Каждый запрос получает `x-request-id` (UUID), прокидывается в логи и в ответ.
**Why:** Логи уезжают в `LOG_COLLECTOR_URL`; PII утечка = GDPR/Russian 152-FZ риск.

## Risks / Trade-offs

- **[Risk] Breaking-change для существующих dev-сессий при смене cookie-флагов и JWT secret.** → Mitigation: ротация проводится в maintenance window, пользователи логинятся заново. Backward-compat не нужен (pre-launch).
- **[Risk] Throttler может блокировать легитимных пользователей на /marketplace при ботовом трафике рядом.** → Mitigation: per-user throttler (по userId) + IP-allowlist для CDN в Caddy.
- **[Risk] DOMPurify на SSR (Nuxt) тормозит first render.** → Mitigation: используем `isomorphic-dompurify` (jsdom только на сервере), кэшируем результат по хэшу контента.
- **[Risk] Non-root контейнер может сломать healthcheck/port-bind на 80/443.** → Mitigation: bind на 8080/8443 + Caddy `net_bind_service` capability, всё остальное `cap_drop`.
- **[Risk] DNS-pinning через undici ломает fetch redirect (если upstream делает 302 на другой домен).** → Mitigation: явно обрабатываем redirect в `customLookup`, перересолвим IP с проверкой после каждого redirect.
- **[Risk] Глобальный `AllExceptionsFilter` может маскировать реальные баги.** → Mitigation: correlation UUID в ответе + stack в server-side логах + alerting на 5xx rate.
- **[Risk] SAST в CI даёт false positives и тормозит разработку.** → Mitigation: настроить baseline, блокируем только `high`/`critical`.
- **[Trade-off] SameSite=Lax ломает any cross-site iframe embed (если когда-то понадобится).** → Принимаем: iframe-embed не в roadmap.
- **[Trade-off] Отказ от external `$ref` dereference снижает гибкость OpenAPI import.** → Принимаем: пользователи должны инлайнить refs сами.
- **[Trade-off] 15-мин presigned URL может нервировать пользователей на медленном соединении.** → Принимаем: on-demand endpoint решает.

## Migration Plan

Выполнять строго последовательно, каждый этап = отдельный PR + smoke-тест на staging.

**Этап 0 — Аварийная ротация секретов (T+0, до кода):**
1. Ротировать MongoDB root, Yandex SQS static keys, Timeweb S3 keys, Yandex OAuth client secret, JWT/NUXT_SESSION secret.
2. Перевытать OAuth `redirect_uri` на HTTPS origin (после D16).
3. Зафиксировать скомпрометированные значения в `env.schema.ts` `.refine` (reject).

**Этап 1 — Backend hardening (D7, D8, D9, D13, D14, D18):** helmet, throttler, global filter, env-fail-fast, YAML schema, logging sanitization. Низкий риск, высокий эффект.

**Этап 2 — Auth fixes (D1–D5):** cookie flags, CSRF, OAuth state, refresh rotation. **BREAKING для всех сессий.**

**Этап 3 — IDOR cleanup (D5):** ownership-чеки в execution/uploads/scenarios/apps/websocket. Добавить unit-тесты на каждый `Forbidden`-сценарий.

**Этап 4 — SSRF + uploads (D6, D11, D12):** ipaddr.js + DNS pinning, magic-bytes валидация, presigned URL TTL.

**Этап 5 — Frontend (D10):** DOMPurify, nuxt-security, замена metrica. Smoke-тест marketplace cards.

**Этап 6 — Infra (D15, D16):** non-root Dockerfiles, Caddy TLS + headers. Deploy на staging с валидацией headers через `securityheaders.com`.

**Этап 7 — CI (D17):** OIDC migration, SAST/Trivy/audit gates, branch-name regex. Удаление `FLOW_TOKEN`.

**Rollback:** Каждый этап — feature-flagged где возможно (например, throttler можно отключить env-флагом). Для breaking auth-изменений rollback = revert PR + повторная выдача старых сессий (пользователи логинятся заново). Infra-изменения (non-root, Caddy) откатываются revert-ом Dockerfile/Caddyfile.

## Open Questions

- **Q1:** Где хранить секреты в проде — Vault (Yandex Lockbox), Doppler или `sops`+git-crypt? Зависит от ops-стандартов команды.
- **Q2:** Использовать `@nestjs/throttler` с in-memory storage или обёрткой над Redis/Mongo? Для single-instance — memory; для HA — Redis.
- **Q3:** Деплоим Caddy с ACME или используем Yandex Certificate Manager + ALB? Зависит от выбранной сетевой архитектуры.
- **Q4:** Делаем ли отдельный `/api/health` с auth-токеном для healthcheck, или оставляем `/` открытым (только internal network)?
- **Q5:** Мигрируем ли metrica на `@nuxt/scripts` сейчас (требует обновления Nuxt) или оставляем как есть с CSP allowlist?
- **Q6:** Запрещаем ли полностью SVG в аватарах, или парсим через DOMPurify перед upload?
