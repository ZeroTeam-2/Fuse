## ADDED Requirements

### Requirement: Fail-fast валидация секретов
`env.schema.ts` SHALL отклонять запуск приложения, если любой из обязательных секретов отсутствует или совпадает с захардкоженным placeholder-значением. Список обязательных секретов: `JWT_SECRET`, `NUXT_SESSION_SECRET`, `MONGODB_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_REDIRECT_URI`.

#### Scenario: Запуск с захардкоженным JWT_SECRET
- **WHEN** `JWT_SECRET=change-me-to-a-random-string-of-at-least-32-characters`
- **THEN** процесс падает при старте с ошибкой `JWT_SECRET must be a strong random value, not the documented placeholder`

#### Scenario: Запуск с пустым S3_ACCESS_KEY
- **WHEN** `S3_ACCESS_KEY` пуст или не задан
- **THEN** процесс падает при старте с ошибкой `S3_ACCESS_KEY is required`

#### Scenario: Запуск со всеми валидными секретами
- **WHEN** все обязательные секреты заданы и не совпадают с placeholder-значениями
- **THEN** приложение успешно стартует

### Requirement: Минимальная энтропия JWT_SECRET
`env.schema.ts` SHALL валидировать `JWT_SECRET` на минимальную длину (≥ 32 символа) и уникальность символов (Shannon entropy ≥ 3.0), чтобы отклонять значения вроде `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.

#### Scenario: Низкая энтропия
- **WHEN** `JWT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (34 символа `a`)
- **THEN** процесс падает с ошибкой `JWT_SECRET has insufficient entropy`

### Requirement: getOrThrow для JWT-секрета в коде
Все места использования `JWT_SECRET` в коде SHALL использовать `configService.getOrThrow<string>("JWT_SECRET")` (а не `configService.get(...) ?? "fallback"`). Фолбэк-строки `"fallback"` MUST быть удалены из всех файлов.

#### Scenario: Отсутствие фолбэков
- **WHEN** разработчик grep-ает кодовую базу по `?? "fallback"` или `?? 'fallback'`
- **THEN** поиск не находит ни одного совпадения

### Requirement: Docker Compose с required-интерполяцией
`docker-compose.yml` SHALL использовать синтаксис `${VAR:?required}` для всех секретов и критичных конфигов. Синтаксис `${VAR:-default}` для секретов MUST быть удалён.

#### Scenario: Compose без нужного секрета
- **WHEN** оператор запускает `docker compose up` без переменной `JWT_SECRET`
- **THEN** compose падает с ошибкой `JWT_SECRET is required` и не запускает контейнеры

### Requirement: Изоляция секретов от build-context
Frontend build MUST NOT читать shared `.env` файл во время сборки. Nuxt конфигурация SHALL загружать только `.env.example` или публичные переменные на build-time; runtime-секреты MUST поставляться через окружение раннера (k8s secrets, Docker env, etc.).

#### Scenario: Build без доступа к `.env`
- **WHEN** запускается `pnpm --filter @fuse/frontend build` без `../../.env` файла
- **THEN** сборка успешно завершается, не падая и не инлайная секреты в bundle

#### Scenario: Runtime валидация session-секрета
- **WHEN** Nuxt server стартует с `NUXT_SESSION_SECRET=build-time-placeholder-0123456789abcdef`
- **THEN** сервер падает с ошибкой `NUXT_SESSION_SECRET must be replaced at runtime`

### Requirement: Валидация scheme для LOG_COLLECTOR_URL
`env.schema.ts` SHALL требовать, чтобы `LOG_COLLECTOR_URL` (если задан) использовал схему `https://`.

#### Scenario: HTTP collector отклонён
- **WHEN** `LOG_COLLECTOR_URL=http://logs.internal/ingest`
- **THEN** процесс падает при старте с ошибкой `LOG_COLLECTOR_URL must use HTTPS`
