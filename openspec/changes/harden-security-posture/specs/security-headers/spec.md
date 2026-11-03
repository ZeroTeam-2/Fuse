## ADDED Requirements

### Requirement: Security-заголовки на backend
Система SHALL подключать helmet на backend. Обязательный набор: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Strict-Transport-Security` в production.

HSTS MUST NOT выставляться вне production: заголовок, однажды полученный браузером с localhost, заставит его требовать HTTPS от всех локальных портов на срок `max-age` — разработка встанет.

Тело запроса MUST быть ограничено по размеру (`json`/`urlencoded` limit). Сейчас лимит не задан и зависит от умолчаний Express; явная граница нужна, чтобы шаги сценария и описания карточек не позволяли отправить произвольно большой документ.

#### Scenario: Заголовки на каждом ответе
- **WHEN** клиент делает любой запрос к backend
- **THEN** ответ содержит перечисленные заголовки

#### Scenario: HSTS только в production
- **WHEN** backend запущен вне production
- **THEN** `Strict-Transport-Security` в ответе отсутствует

### Requirement: Запрет кэширования auth-ответов
Ответы маршрутов `/api/auth/*` SHALL содержать `Cache-Control: no-store`: в них приходят `Set-Cookie` с сессией, и промежуточное кэширование делает сессию общей.

#### Scenario: Ответ входа не кэшируется
- **WHEN** клиент получает ответ от любого маршрута `/api/auth/*`
- **THEN** ответ содержит `Cache-Control: no-store`

### Requirement: TLS и security-заголовки на Caddy
Caddyfile SHALL терминировать TLS для production-домена и добавлять `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Сейчас прокси слушает открытый `:8081` без TLS и без единого заголовка, и именно он — внешняя граница системы.

Переход на HTTPS MUST сопровождаться перевыпуском OAuth `redirect_uri` на новый origin, иначе вход сломается в момент выкатки.

#### Scenario: HTTP редиректится на HTTPS
- **WHEN** клиент обращается к production-домену по HTTP
- **THEN** Caddy отвечает редиректом на HTTPS и обслуживает запрос по TLS с валидным сертификатом

#### Scenario: Заголовки доезжают через прокси
- **WHEN** клиент запрашивает страницу фронтенда или маршрут API через Caddy
- **THEN** итоговый ответ содержит заголовки из блока `header`

### Requirement: CSP на фронтенде
Фронтенд SHALL отдавать `Content-Security-Policy`, запрещающий загрузку скриптов со сторонних источников и встраивание в iframe (`frame-ancestors 'none'`, `base-uri 'self'`).

Политика MUST учитывать, что Nuxt при SSR встраивает инлайновый скрипт с состоянием гидрации: `script-src 'self'` без nonce или хэша ломает гидрацию на всех страницах. Политика MUST выдавать nonce на запрос (штатный механизм модуля безопасности Nuxt) либо разрешать конкретные хэши — `'unsafe-inline'` в `script-src` MUST NOT использоваться. Источники, которые реально нужны: шрифты Google (`style-src`, `font-src`), Яндекс.Метрика (`script-src`, `img-src`), WebSocket того же origin (`connect-src`).

#### Scenario: Сторонний скрипт заблокирован
- **WHEN** в разметку попадает скрипт с источником, которого нет в политике
- **THEN** браузер блокирует его выполнение и сообщает о нарушении политики

#### Scenario: Гидрация не ломается
- **WHEN** пользователь открывает любую SSR-страницу с включённой CSP
- **THEN** инлайновый скрипт состояния выполняется (nonce или хэш), страница гидрируется, ошибок CSP в консоли нет

### Requirement: Документация API недоступна в production
Система SHALL регистрировать `/api/docs` и `/api/schema.json` только вне production. Сейчас оба маршрута открыты без аутентификации и отдают полную карту API вместе со схемами тел запросов.

Генерация типов фронтенда (`pnpm gen:types`) ходит на `/api/schema.json` локального инстанса и этим изменением не затрагивается.

#### Scenario: Production без документации
- **WHEN** клиент запрашивает `/api/docs` или `/api/schema.json` на production-инстансе
- **THEN** система отвечает `404`

#### Scenario: Вне production документация доступна
- **WHEN** разработчик открывает `/api/docs` на локальном инстансе
- **THEN** страница справочника отдаётся как прежде
