## Context

`fuse-platform-mvp` — founding change: NestJS + MongoDB + Nuxt, кода почти нет. Его решения D1 (синхронное SSE-исполнение в процессе запроса) и D6 (email+password) не совпадают с целевой инфраструктурой команды — **Yandex Cloud**. Этот change суперседирует их, пока код не написан.

Текущий стек: pnpm-монорепо, `@nestjs/mongoose`, `@nestjs/swagger` + Scalar, OpenAPI→типы (`gen:types`), Nuxt 3 + `openapi-fetch`. Docker: caddy/backend/frontend, MongoDB внешний. Очередей, WS, auth, загрузки файлов, сценариев, тестов — нет.

Новые облачные сервисы: **Yandex Message Queue (YMQ)** — совместима с Amazon SQS (`@aws-sdk/client-sqs`); **Yandex Cloud Monitoring (monium)** — метрики/логи; **Yandex Metrica** — фронтенд-аналитика; **Yandex ID OAuth 2.0** — вход. Object Storage/MinIO — для файлов (из D4 founding-change).

## Goals / Non-Goals

**Goals:**
- Перевести запуск сценариев на асинхронную очередь main process → workers с сохранением промежуточных состояний, статусами и резюме после сбоя.
- Доставлять ход выполнения через WebSocket (вместо SSE), с безопасным реконнектом по `runId`.
- Заменить email+password на Yandex ID OAuth 2.0.
- Задать порог разовой загрузки файла 25 МБ (выше — только чанки).
- Подключить опциональную наблюдаемость: Yandex Metrica + monium.
- Встроить тесты (unit/integration/e2e) в каждый milestone как часть приёмки.

**Non-Goals:**
- Биллинг, квоты, версионирование сценариев — остаются вне (как в founding-change).
- Полноценный secret-manager, продвинутый оркестратор с ветвлениями/условиями — поток остаётся линейным.
- Миграция данных — greenfield, миграций нет; конфликты с founding-change разрешаются в пользу этого change редактированием его delta-спек.

## Decisions

**DR1. Очередь — Yandex Message Queue (SQS-совместимая), не Redis/BullMQ.**
Команда на Yandex Cloud; YMQ — управляемый, без эксплуатации Redis. Взаимодействие через `@aws-sdk/client-sqs` с эндпоинтом Yandex. Альтернативы: Redis+BullMQ (отвергнут — лишний компонент, не в облаке), Yandex Cloud Functions (неочевидный контроль воркеров). Очередь — standard (at-least-once), visibility timeout покрывает максимальную длительность шага; при превышении сообщение возвращается и подхватывается другим воркером (основа резюме).

**DR2. Модель main process → workers.**
- **Main process** (NestJS API, обслуживает HTTP+WS): валидирует запрос запуска, создаёт документ `Run` (status=`queued`), кладёт сообщение в YMQ `{ runId, scenarioId, userId, resumeFromStep? }`.
- **Workers** (отдельный Node-process, общий кодовый модуль `execution`): long-poll YMQ, забирают сообщение, грузят `Run` + `Scenario`, исполняют шаги с **резолва точки `resumeFromStep`**, после каждого шага персистят состояние в `Run`, по завершении/ошибке обновляют статус и `deleteMessage`. При падении воркера сообщение возвращается по истечении visibility timeout → другой воркер дочитывает `Run` и продолжает с последнего незавершённого шага.
- **Возобновление ввода (`waiting_input`)**: до шага со страницей воркер выставляет `Run.status=waiting_input`, сохраняет контекст, НЕ удаляет сообщение (или переотправляет resume-сообщение при `deleteMessage`-модели). Пользователь отправляет ввод через POST API → main process обновляет `Run` и кладёт resume-сообщение в очередь. Воркер продолжает.

**DR3. Транспорт — WebSocket (`@nestjs/websockets` + `@nestjs/platform-ws`), не SSE.**
Клиент открывает WS-соединение, подписывается на `runId` и получает события (`step:start`, `step:done`, `page:required`, `run:done`, `run:error`, `status`). Воркеры НЕ держат WS — они пишут события и статусы в документ `Run` (журнал). API-gateway ретранслирует изменения клиентам: **MongoDB Change Streams** на коллекции `Run` → fan-out в WS-комнаты по `runId`. Change Streams требуют replica set (для локального dev — `--replSet` или in-memory через тестовый одноранговый режим). Фолбэк при отсутствии change streams — короткий polling `Run` по `runId` (безопасен: журнал событий версионирован, клиент шлёт `lastEventId`). Альтернатива SSE отвергнута по требованию; polling оставлен только фолбэком.

**DR4. Жизненный цикл и статусы Run.**
`queued → running → (waiting_input → running)* → done | error | cancelled`. Промежуточное состояние: `Run.steps[]` с пошаговым `status/inputs/outputs/startedAt/finishedAt/error` + `events[]` (журнал). Статус верхнего уровня агрегируется из шагов. `cancelled` — по запросу пользователя (воркер проверяет флаг перед каждым шагом).

**DR5. Аутентификация — Yandex ID OAuth 2.0 (только вход).**
Флоу Authorization Code: `/auth/yandex` → редирект на Yandex → callback `/auth/yandex/callback` → обмен кода на токен → запрос профиля (Yandex Login API). При первом входе создаётся `User` (email, name, avatar из Yandex); при повторном — апсерт. Сессия — JWT (access+refresh) в httpOnly cookie, как в D6 founding-change, но пароля/регистрации нет. `passport-yandex-oauth2` или ручной OAuth-клиент. Публичен только каталог; остальное — под guard. Альтернатива «OAuth + email fallback» отвергнута по решению команды (только Yandex).

**DR6. Загрузка файла — порог 25 МБ.**
≤25 МБ → один запрос (multipart) через backend в Object Storage/провайдеру. >25 МБ → **обязательно** чанками (init/part/complete/abort, состояние частей в Mongo, pause/resume, восстановление после обрыва — из D4). Frontend определяет режим по размеру до старта. Порог — конфигурируемая переменная (`UPLOAD_SINGLE_MAX_MB=25`), но дефолт 25.

**DR7. Наблюдаемость — опционально, через конфиг (disabled по умолчанию).**
- **Yandex Metrica** (фронтенд): инъекция счётчика в Nuxt при `NUXT_PUBLIC_YANDEX_METRIKA_ID`. Продуктовые события (запуск сценария, публикация).
- **monium / Yandex Cloud Monitoring** (бэкенд): structured-логи и метрики через `@aws-sdk/client-cloudwatch` (PutMetricData) или YC logging API при `YC_*` переменных; otherwise `pino`-вывод в stdout. Ключевые метрики: длина очереди, время выполнения шага, ошибки, статусы Run.
- Внедряются как interceptor/module, не размазываясь по доменной логике.

**DR8. Тестирование встроено в milestone (не отдельная финальная фаза).**
- **Unit (Vitest)**: резолв маппингов, токен-подстановка, статус-переходы, парсер, OAuth-маппинг профиля, порог 25 МБ.
- **Integration (NestJS Testing + in-memory Mongo / test DB)**: endpoints auth, CRUD приложений/сценариев, enqueue→Run, queue-воркер на моке YMQ.
- **E2E (Playwright)**: сквозной запуск сценария через UI с реальным WS и (замоканной) YMQ.
Каждый milestone завершается «Definition of Done», включающим соответствующие тесты.

## Risks / Trade-offs

- [Падение воркера на середине шага → дублирование эффекта (at-least-once)] → шаги идемпотентны где возможно (GET-вызовы безопасны); для мутаций — guard по `step.attempt` в `Run`; visibility timeout ≥ максимального шага; dead-letter после `maxReceiveCount`.
- [YMQ — point-to-point, не pub/sub; fan-out событий в WS требует ретрансляции] → выбран MongoDB Change Streams как единый источник событий; это требует replica set (ограничение) → фолбэк на polling по `lastEventId`.
- [Change Streams / visibility timeout не покрывают длинные периодические шаги (минуты)] → `PeriodicStep` воркер держит сообщение активным продлением visibility timeout (YMQ `ChangeMessageVisibility`) на каждой итерации опроса.
- [SSRF сохраняется (воркер делает запросы по пользовательским URL)] → allowlist схем (https), запрет приватных IP, таймауты и лимиты размера ответа (из founding-change риск-секции) действуют в воркере.
- [OAuth-токен Yandex истекает / отозван] → при провале refresh сессия инвалидируется, пользователь входит заново; не храним «пароли» — нечего терять.
- [Зависимость от Yandex Cloud в dev/CI] → YMQ-клиент за интерфейсом (`QueueClient`); в тестах — in-memory/мок реализация; локально можно поднять эластикmq (SQS-compatible) в docker.
- [Change Streams требуют replica-set MongoDB, а локально Mongo поднимается как single] → docker-compose переводим на `--replSet`; иначе polling-фолбэк.

## Migration Plan

Greenfield — миграций данных нет. Порядок:
1. Инфра: docker-compose (Mongo replica-set, опц. MinIO, опц. elasticmq для локальной YMQ); завести YMQ-очередь `fuse-runs` в облаке.
2. Backend: shared-модуль `execution` (интерфейсы `QueueClient`, `RunStore`), WS-gateway, OAuth-модуль, воркер-entrypoint.
3. Фронтенд: WS-клиент, «Войти через Yandex», порог чанковки.
4. Наблюдаемость — последним, за фича-флагами.
5. `fuse-platform-mvp`: обновить delta-спеки (D1→WebSocket+queue, D6→Yandex) и milestones (встроить тесты) — конфликт разрешается в пользу этого change.

Откат: каждый слой за интерфейсом (QueueClient, RunStore) — можно отключить очередь и вернуться к in-process, но это не целевое состояние.

## Open Questions

- Окно visibility timeout / `maxReceiveCount` для `fuse-runs` — подобрать после замеров длинных шагов (Periodic).
- Хранить ли полные тела ответов шагов в `Run` (PII/объём) — предлагается TTL-коллекция с усечением (унаследовано из founding-change).
- Нужен ли `paused` отдельным статусом от `waiting_input` (пользовательская пауза) — пока объединяем в `waiting_input`/`cancelled`.
