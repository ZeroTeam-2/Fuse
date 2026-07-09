## Why

Founding-change `fuse-platform-mvp` ещё не реализован, и его ключевые архитектурные решения (D1: синхронное SSE-исполнение; D6: email+password) конфликтуют с целевой инфраструктурой команды — Yandex Cloud. Нужно зафиксировать ревизию «до того, как код написан»: перевести аутентификацию на Yandex ID, вынести исполнение сценариев в очередь (main process → workers) с Yandex Message Queue, заменить SSE на WebSocket, задать порог разовой загрузки файла и подключить наблюдаемость (Yandex Metrica + Yandex Cloud Monitoring/monium). Параллельно — встроить практику тестирования (unit/integration/e2e) в каждый milestone.

## What Changes

- **BREAKING** Аутентификация: вместо регистрации/входа по email+паролю — вход только через Yandex ID (OAuth 2.0). Регистрация как отдельный экран убирается; аккаунт создаётся при первом входе. Смена пароля удаляется (пароля нет).
- **BREAKING** Исполнение сценариев: вместо синхронного стриминга поверх SSE в процессе запроса — асинхронная очередь. Main process (NestJS API) создаёт задачу на запуск; workers забирают и исполняют сценарий, сохраняя промежуточные состояния; статусы запуска (queued/running/waiting_input/paused/done/error) и резюме после падения воркера/обрыва.
- **BREAKING** Транспорт событий запуска: WebSocket вместо SSE. Клиент подписывается по `runId`, получает события шагов и статусы; реконнект безопасен (события журналируются).
- Очередь: Yandex Message Queue (совместимо с Amazon SQS) — через `@aws-sdk/client-sqs`. Промежуточное состояние — в MongoDB (документ Run).
- Загрузка файлов: фиксированный порог **25 МБ** — файлы ≤25 МБ грузятся одним запросом, больше 25 МБ — только чанками (multipart) с паузой/возобновлением.
- Наблюдаемость (опционально, через конфиг): Yandex Metrica на фронте + Yandex Cloud Monitoring (monium) для сбора метрик и логов бэкенда.
- Тесты в каждом milestone: unit (Vitest), интеграционные (NestJS Testing + тестовая БД), e2e (Playwright) — как часть приёмки milestone, а не финальная стабилизация.

## Capabilities

### New Capabilities
- `queue-execution`: исполнение сценариев через очередь — main process ставит задачи в Yandex Message Queue, workers исполняют; жизненный цикл запуска со статусами, персист промежуточных состояний, резюме после сбоя, ретраи.
- `observability`: опциональные интеграции — Yandex Metrica (продуктовая аналитика фронтенда) и Yandex Cloud Monitoring / monium (метрики и структурированные логи бэкенда), включаются переменными окружения.

### Modified Capabilities
- `auth-profile`: вход и создание аккаунта через Yandex ID OAuth 2.0 вместо email+пароля; убрана регистрация и смена пароля; профиль наполяется данными из Yandex (имя, email, аватар).
- `scenario-execution`: доставка событий запуска через WebSocket вместо SSE; порог разовой загрузки файла 25 МБ (выше — только чанки), остальное поведение движка сохраняется.

## Impact

- `apps/backend` (NestJS): новый модуль очереди (`@aws-sdk/client-sqs` → Yandex Message Queue), WebSocket gateway (`@nestjs/websockets`/`ws`), OAuth-модуль Yandex (passport-yandex или ручной OAuth-флоу), emitter метрик/логов в monium; workers как отдельный entrypoint/process.
- `apps/frontend` (Nuxt): WebSocket-клиент хода запуска (вместо EventSource), кнопка «Войти через Yandex», инициализация Yandex Metrica (опц.), логика порога чанковки (25 МБ) при загрузке.
- `packages/shared`: типы статусов `Run`, форматы WS-событий, конфиг-переменные наблюдаемости.
- Инфраструктура: Yandex Message Queue (очередь запусков), Object Storage/MinIO (файлы), Yandex Cloud Monitoring (monium) — опционально; переменные окружения OAuth-credentials и YC-ключи.
- `fuse-platform-mvp`: его решения D1 (SSE) и D6 (email) суперседятся — при имплементации конфликты разрешаются в пользу этого change; соответствующие delta-спеки founding-change обновляются.
- Зависимости: `@nestjs/websockets`, `@nestjs/platform-ws`/`ws`, `@aws-sdk/client-sqs`, `passport-yandex-oauth2` (или эквивалент), `@aws-sdk/client-cloudwatch` (опц.).
