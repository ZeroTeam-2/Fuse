## ADDED Requirements

### Requirement: Глобальный throttle на HTTP-запросы
Система SHALL применять rate-limiting ко всем входящим HTTP-запросам через `ThrottlerGuard`, зарегистрированный как `APP_GUARD`. Дефолтный лимит MUST быть не более 60 запросов в минуту per-IP (или per-user при аутентификации). При превышении система MUST отвечать `429 Too Many Requests` с заголовком `Retry-After`.

#### Scenario: Превышение дефолтного лимита
- **WHEN** клиент делает более 60 запросов в минуту на любые API-эндпоинты
- **THEN** система отвечает `429 Too Many Requests` и добавляет заголовок `Retry-After` с числом секунд до сброса окна

#### Scenario: Легитимный пользователь под лимитом
- **WHEN** аутентифицированный пользователь делает 50 запросов в минуту
- **THEN** все запросы обрабатываются без задержек и блокировок

### Requirement: Строгие лимиты на auth-эндпоинты
Система SHALL применять лимит не более 5 запросов в минуту per-IP к эндпоинтам `/api/auth/login`, `/api/auth/callback`, `/api/auth/refresh`, `/api/auth/logout`.

#### Scenario: Брутфорс refresh-токена
- **WHEN** атакующий делает более 5 запросов на `/api/auth/refresh` в минуту с одного IP
- **THEN** последующие запросы блокируются с `429` до истечения окна

### Requirement: Лимиты на публичный marketplace
Система SHALL применять лимит не более 30 запросов в минуту per-IP к публичным эндпоинтам `/api/marketplace` и `/api/marketplace/categories`.

#### Scenario: Скрейпинг маркетплейса
- **WHEN** неаутентифицированный клиент делает более 30 запросов в минуту на `/api/marketplace`
- **THEN** система отвечает `429` и не отдаёт данные до сброса окна

### Requirement: Лимиты на upload-эндпоинты
Система SHALL применять лимит не более 10 запросов в минуту per-user к эндпоинтам `/api/uploads/*` и `/api/users/me/avatar`.

#### Scenario: DoS через множественные загрузки
- **WHEN** аутентифицированный пользователь инициирует более 10 загрузок в минуту
- **THEN** последующие запросы на upload блокируются с `429`

### Requirement: Throttler storage для multi-instance deployment
Система SHALL поддерживать конфигурируемое хранилище throttle-счётчиков (in-memory для single-instance, Redis/Mongo для HA) через `ThrottlerModule` storage option. Конфигурация MUST задаваться env-переменной `THROTTLE_STORAGE`.

#### Scenario: Single-instance deployment
- **WHEN** `THROTTLE_STORAGE` не задан или равен `memory`
- **THEN** throttler использует in-memory storage без внешних зависимостей

#### Scenario: HA deployment
- **WHEN** `THROTTLE_STORAGE=redis`
- **THEN** throttler использует Redis-хранилище для согласованного state между инстансами
