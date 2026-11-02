## Why

Локально в браузере войти в Fuse нечем, кроме Yandex OAuth: `AuthController.login` ведёт на `oauth.yandex.ru`, а `handleCallback` требует `YANDEX_CLIENT_ID`/`YANDEX_CLIENT_SECRET` и зарегистрированный `redirect_uri`. Разработчик без этих кредов (или без сети до Яндекса) не может открыть ни один приватный раздел — остаётся только подписать JWT вручную, как это делает `apps/frontend/e2e/auth.setup.ts`. Для человека с браузером такого пути нет.

## What Changes

- Новый эндпоинт `POST /api/auth/dev-login` принимает `{ email, password }` и сверяет их с парой `DEV_LOGIN_EMAIL`/`DEV_LOGIN_PASSWORD` из конфигурации окружения. Пароли нигде не хранятся: ни в БД, ни в коде — только в локальном конфиге.
- Эндпоинт отвечает 404, пока обе переменные не заданы. При `NODE_ENV=production` с заданным паролем бэкенд падает на старте, а не поднимается с открытой дверью.
- Сессия выдаётся существующим кодом: та же пара access/refresh, те же httpOnly-куки, та же подпись. Guard, `JwtStrategy` и проверка подписи не меняются — запрета на «режим без авторизации» из `local-dev-seed` изменение не нарушает.
- Модалка входа получает форму email/пароль под кнопкой Яндекс ID. Форма рисуется только когда бэкенд подтвердил, что dev-вход настроен (проба `GET /api/auth/dev-login`).
- Переменные задаются в `.env.local.example` (бэкенд на хосте) и прокидываются в сервис `backend` в `docker-compose.yml` (стек целиком в докере).

## Capabilities

### New Capabilities
- `local-dev-login`: вход в локально запущенный Fuse по логину и паролю из конфигурации окружения, в обход OAuth, с условиями, при которых эндпоинт не существует.

### Modified Capabilities
- `auth-profile`: модалка входа вне production дополняется формой email/пароль; Яндекс ID остаётся основным способом и единственным в бою.

## Impact

**Код (backend)**
- `apps/backend/src/auth/auth.controller.ts` — новый маршрут `dev-login`, переиспользует приватный `setAuthCookies`.
- `apps/backend/src/auth/yandex-auth.service.ts` — `issueTokens` становится публичным (новой логики не добавляется).
- `apps/backend/src/auth/dto/dev-login.dto.ts` — новый.
- `apps/backend/src/config/env.schema.ts` — `DEV_LOGIN_EMAIL`, `DEV_LOGIN_PASSWORD`, запрет непустого пароля в production.

**Код (frontend)**
- `apps/frontend/components/LoginModal.vue` — форма email/пароль, скрыта в проде.

**Окружение**
- `.env.local.example` — пара кредов с комментарием, что это машина разработчика.
- `docker-compose.yml` — проброс двух переменных в сервис `backend` (по умолчанию пустые).
- `README.md` — раздел о локальном входе.

**Зависимости** — не меняются.

**Пересечения**
- `harden-security-posture` правит `auth.controller.ts` и тоже содержит delta для `auth-profile`: порядок слияния нужно согласовать. Если harden идёт первым, `dev-login` подчиняется его CSRF- и throttle-правилам как любой другой state-changing POST.
