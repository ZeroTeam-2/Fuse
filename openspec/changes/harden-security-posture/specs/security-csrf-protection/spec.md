## ADDED Requirements

### Requirement: SameSite=Lax для auth-кук
Система SHALL устанавливать auth-куки (`access_token`, `refresh_token`) с атрибутом `SameSite=Lax` во всех окружениях, включая production. Атрибут `Secure` MUST быть `true` в production. Куки MUST иметь `HttpOnly=true` и `Path=/api`.

#### Scenario: Production cookie flags
- **WHEN** система выдаёт auth-куки в production-окружении
- **THEN** каждый `Set-Cookie` содержит `HttpOnly; Secure; SameSite=Lax; Path=/api`

#### Scenario: Dev cookie flags
- **WHEN** система выдаёт auth-куки в dev-окружении
- **THEN** каждый `Set-Cookie` содержит `HttpOnly; SameSite=Lax; Path=/api` (без `Secure`, допускает HTTP на localhost)

### Requirement: POST-only logout
Система SHALL принимать logout только методом `POST /api/auth/logout`. Endpoint `GET /api/auth/logout` MUST быть удалён.

#### Scenario: Logout через POST
- **WHEN** аутентифицированный пользователь отправляет `POST /api/auth/logout` с CSRF-токеном
- **THEN** система инвалидирует сессию и очищает auth-куки с теми же `Path`/`Domain`/`SameSite` атрибутами, что использовались при установке

#### Scenario: Logout через GET заблокирован
- **WHEN** любой клиент запрашивает `GET /api/auth/logout`
- **THEN** система отвечает `404 Not Found` (или `405 Method Not Allowed`) и не очищает куки

### Requirement: CSRF-токен double-submit
Система SHALL выдавать CSRF-токен через `csrf-csrf` библиотеку в отдельной httpOnly-куке (`csrf-token`) с `SameSite=Lax`. Все state-changing эндпоинты (POST/PUT/PATCH/DELETE) MUST требовать presence и валидность заголовка `x-csrf-token`, совпадающего с cookie. Сравнение MUST быть timing-safe.

#### Scenario: Запрос без CSRF-токена
- **WHEN** клиент отправляет `POST /api/scenarios` без заголовка `x-csrf-token`
- **THEN** система отвечает `403 Forbidden` с ошибкой `CSRF token missing`

#### Scenario: Несовпадение токенов
- **WHEN** клиент отправляет `POST /api/runs/:id/cancel` с заголовком `x-csrf-token: abc`, но кука `csrf-token=xyz`
- **THEN** система отвечает `403 Forbidden` с ошибкой `CSRF token mismatch`

#### Scenario: Валидный CSRF-токен
- **WHEN** клиент отправляет state-changing запрос с корректным `x-csrf-token`, совпадающим с cookie
- **THEN** запрос обрабатывается нормально

### Requirement: Origin/Referer валидация для non-GET
Система SHALL иметь глобальный guard, который для всех non-GET запросов проверяет, что заголовок `Origin` (или `Referer` при отсутствии `Origin`) совпадает с разрешённым `APP_URL`. Запросы без обоих заголовков MUST отклоняться с `403`.

#### Scenario: Cross-site request block
- **WHEN** браузер отправляет `POST /api/users/me/avatar` с `Origin: https://evil.com`
- **THEN** система отвечает `403 Forbidden`, даже если auth-кука присутствует

#### Scenario: Same-origin request
- **WHEN** браузер отправляет `POST /api/users/me/avatar` с `Origin: https://fuse.example.com` (равным `APP_URL`)
- **THEN** запрос проходит к контроллеру

### Requirement: Выдача CSRF-токена через отдельный эндпоинт
Система SHALL предоставлять `GET /api/auth/csrf-token`, возвращающий свежий CSRF-токен в `csrf-token` cookie. Endpoint MUST быть доступен только аутентифицированным пользователям.

#### Scenario: Получение CSRF-токена после логина
- **WHEN** аутентифицированный пользователь запрашивает `GET /api/auth/csrf-token`
- **THEN** система устанавливает `csrf-token` cookie и возвращает токен в JSON-ответе для использования в `x-csrf-token` заголовке
