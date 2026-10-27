# separate-worker-process — design

## Context

Сегодня `WorkerService` (SQS-консьюмер, [apps/backend/src/execution/worker.service.ts](../../../apps/backend/src/execution/worker.service.ts)) регистрируется в `ExecutionModule` и стартует хуком `onApplicationBootstrap` внутри того же NestJS-процесса, что и HTTP API + два socket.io-гейтвея (`RunGateway`, `NotificationsGateway`). События исполнения публикуются прямым вызовом гейтвея в памяти. Параллелизм — захардкоженный `batchSize: 5`. Инфраструктура: SQS (LocalStack в деве, YMQ в проде), MongoDB (standalone `mongo:7` в деве, облачная в проде), MinIO/S3.

Ограничения:

- Клиентские сокеты подключены к API-процессу — отдельный воркер должен доставлять события через межпроцессный канал.
- Решение согласовано с пользователем: канал — существующая MongoDB, без добавления Redis; воркер — второй entrypoint в `@fuse/backend`, без выноса кода в отдельный пакет.
- `@socket.io/mongo-adapter` отпал при проверке: он работает только через change streams, которые требуют replica set. Дев-Mongo — standalone (конверсия в single-node replica set при включённом auth тянет за собой keyfile), статус прод-Mongo неизвестен. Полагаться на это нельзя.

## Goals / Non-Goals

**Goals:**

- API-процесс не потребляет SQS; воркер-процесс не поднимает HTTP.
- N воркеров работают на одной очереди без координации между собой (семантика SQS).
- WS-события воркера (`step:*`, `run:*`, `page:required`, `input:required`, `progress`, `notification:new`) доходят до клиентов API-процесса с задержкой, незаметной пользователю (< ~1 с).
- Параллелизм одного воркера конфигурируем через env.
- Один Docker-образ на оба процесса; масштабирование через compose.
- Dev-режим: оба процесса в watch, рестарт API не прерывает исполнение запусков.

**Non-Goals:**

- Несколько инстансов API за балансировщиком (мост это уже не сломает — каждый API-инстанс читает все события и эмитит своим сокетам, — но балансировка/sticky sessions для socket.io не входит в change).
- Приоритизация задач, rate limiting, автоскейлинг воркеров.
- Изменение семантики исполнения шагов, статусов Run, идемпотентности повторных доставок.

## Decisions

### D1. Мост событий: capped-коллекция Mongo + tailable cursor (самописный, односторонний)

Поток событий строго односторонний: воркер → API → клиенты. Полноценный adapter/emitter socket.io не нужен — нужна шина «опубликовать конверт, получить конверт».

- Коллекция `ws_events_bridge`: capped, ~1 МБ (создаётся идемпотентно при старте любого процесса; `NamespaceExists` игнорируется). Capped-коллекция сама вытесняет старые документы — TTL и чистка не нужны.
- Конверт: `{ ns: "runs" | "notifications", room: string, event: string, payload: unknown, createdAt: Date }`.
- Воркер пишет конверты обычным `insertOne` через существующее mongoose-подключение.
- API держит tailable cursor c `awaitData` (поток `find({}, { tailable: true, awaitData: true })` с курсором после последнего `_id`); при смерти курсора (обрезка capped, реконнект) — пересоздаёт его в цикле с бэкоффом. Известный корнер-кейс: tailable cursor не живёт на пустой коллекции — при создании вставляется seed-документ.
- Полученный конверт API маршрутизирует: `ns: "runs"` → `RunGateway.emitToRun(room, event, payload)`, `ns: "notifications"` → `NotificationsGateway` в комнату `user:{userId}`.

Почему не альтернативы:

- `@socket.io/mongo-adapter` + emitter — требует change streams → replica set (см. Context). Отклонено как условие на инфраструктуру, которое не можем гарантировать ни в деве, ни в проде.
- Redis adapter — новый инфраструктурный компонент в dev/prod; пользователь выбрал вариант без него.
- HTTP-колбэк воркера в API — связывает воркер с доступностью API и ломается при нескольких API-инстансах.
- Потеря событий при пересоздании курсора некритична: `RunGateway` уже шлёт снапшот состояния `Run` при каждом подключении/реконнекте клиента, а состояние всегда персистится в Mongo до публикации события — мост доставляет «живость», а не истину.

### D2. Абстракция публикации: токен `EVENT_BUS` с двумя реализациями

Интерфейс `EventBus { publishRun(runId, event: ServerWsEvent): void|Promise<void>; publishNotification(userId, payload: NotificationNewPayload): ... }`, DI-токен, новый модуль `src/events/`:

- **API** (`LocalEventBus`): прямые вызовы `RunGateway` / `NotificationsGateway` — как сегодня. Плюс сервис `BridgeTailer` (`OnApplicationBootstrap`), который тейлит `ws_events_bridge` и пересылает конверты в те же гейтвеи.
- **Воркер** (`MongoBridgeEventBus`): `insertOne` конверта в capped-коллекцию.

Потребители перестают знать о гейтвеях: `WorkerService` и `NotificationsService` инжектят `EVENT_BUS`. Это единственное изменение их зависимостей — логика исполнения не трогается. `EventsModule.forApi()` / `EventsModule.forWorker()` (dynamic module) выбирает реализацию; `NotificationsModule` перестаёт отдавать гейтвей сервису напрямую.

`ExecutionService` (API-сторона: cancel, submit) продолжает публиковать события — через тот же токен, в API-процессе это `LocalEventBus`, поведение не меняется.

**Инвентарь точек эмита (по графу кода, `graphify`).** Прямых вызовов гейтвеев
в продакшн-коде ровно семь, в двух файлах — это полный объём замены на
`EVENT_BUS`:

| Файл                             | Место                                   | Вызов                                   |
| -------------------------------- | --------------------------------------- | --------------------------------------- |
| `execution/worker.service.ts`    | `:190` `publish()`                      | `RunGateway.publish()`                  |
| `execution/worker.service.ts`    | `:456` `executeRun()`                   | `NotificationsService.notifyRunEvent()` |
| `execution/worker.service.ts`    | `:1211` `requestUserInput()`            | `notifyRunEvent()`                      |
| `execution/worker.service.ts`    | `:1225` `failRun()`                     | `notifyRunEvent()`                      |
| `execution/execution.service.ts` | `:184` `cancelRun()`                    | `notifyRunEvent()`                      |
| `execution/execution.service.ts` | `:222` `cancelActiveRunsForScenarios()` | `notifyRunEvent()`                      |
| `execution/execution.service.ts` | `:237` `publishCancelled()`             | `RunGateway.publish()`                  |

Внутри воркера все WS-события уже проходят через единственную обёртку
`worker.service.ts:190`, поэтому на стороне воркера `MongoBridgeEventBus`
подключается в одном месте, а не в каждом `execute*Step`.

Не является эмитом и через `EVENT_BUS` не идёт:
`execution.service.ts:438` `deleteRun() → NotificationsService.deleteForRun()` —
каскадное удаление уведомлений, прямая зависимость от сервиса остаётся.

### D3. Второй entrypoint: `worker-main.ts` + `WorkerAppModule`

- `worker-main.ts`: `NestFactory.createApplicationContext(WorkerAppModule)` + `enableShutdownHooks()`. Без HTTP, без Swagger, без guards.
- `WorkerAppModule`: `ConfigModule` (та же `validateEnv`), `MongooseModule.forRootAsync`, `MinioModule`, `NotificationsModule`, `EventsModule.forWorker()` и worker-срез execution (модели Run/Scenario/App, `WorkerService`, `ManualInputsService`, `SsrfGuard`) — без `ExecutionController`.
- `WorkerService` удаляется из провайдеров `ExecutionModule` — API-граф его больше не содержит, значит API не стартует консьюмер. Никаких env-флагов «embedded worker» не вводим: режим определяется entrypoint'ом.
- `nest build` собирает оба entrypoint'а одним проходом (оба лежат в `src/`, дополнительной конфигурации сборки не нужно; в `dist/` появляется `worker-main.js`).

**Импортный замок воркера (по графу кода, `graphify`).** `worker.service.ts`
тянет ровно 14 файлов проекта — это и есть минимальный состав
`WorkerAppModule`, проверенный по графу, а не по памяти:

- схемы: `apps/app.schema.ts`, `execution/run.schema.ts`,
  `scenarios/scenario.schema.ts`;
- сервисы: `minio/minio.service.ts`, `notifications/notifications.service.ts`,
  `execution/manual-inputs.service.ts`;
- чистые модули: `apps/base-url.ts`, `apps/ssrf-guard.ts`,
  `config/file-limits.constants.ts`, `execution/execution-errors.ts`,
  `execution/manual-inputs.ts`, `execution/mapping-resolver.ts`,
  `execution/response-artifacts.ts`;
- **`websocket/run.gateway.ts`** — единственная зависимость воркера, которой в
  его процессе быть не должно; её и снимает D2.

Снаружи: `@fuse/shared` (`enums`, `events`, `pages`, `types`) и npm
(`@aws-sdk/client-sqs`, `sqs-consumer`, `@nestjs/common`, `@nestjs/config`,
`@nestjs/mongoose`, `mongoose`, `node:crypto`). Ни одного файла из
`src/auth/`, `src/uploads/`, `src/marketplace/`, `src/users/`, `src/logging/`
воркер не импортирует — в `WorkerAppModule` их добавлять не нужно.

Структурный критерий готовности D2+D3: после правки в импортном замке
`worker.service.ts` не остаётся ни одного файла из `src/websocket/`.
Проверяется на свежем графе (`graphify extract . --code-only --no-cluster
--force`) запросом `graphify explain "WorkerService" --all` — ни одной связи с
`run.gateway.ts`.

### D4. Параллелизм: `WORKER_CONCURRENCY` (1–10, дефолт 5)

`batchSize` sqs-consumer = числу сообщений одного `ReceiveMessage`; SQS ограничивает его 10. `WORKER_CONCURRENCY` валидируется в `env.schema.ts` (clamp 1–10). Потребность в >10 одновременных запусков закрывается количеством воркеров, а не одним толстым процессом — это и есть цель change. Ожидания в `waiting_input` слот не держат (уже реализовано через `RunPausedError`).

### D5. Деплой: отдельный сервис `worker` в docker-compose.yml

- Тот же `apps/backend/Dockerfile` (образ не меняется), `command: ["node", "apps/backend/dist/worker-main"]`.
- Без `container_name` (иначе не масштабируется), без `ports`; масштаб — `docker compose up -d --scale worker=N` (или `deploy.replicas`).
- То же окружение, что у `backend` (Mongo, SQS, S3, лимиты); `PORT`/`APP_URL` воркеру не нужны, но не мешают (общая env-схема).
- Healthcheck: у воркера нет HTTP — простая проверка живости процесса (`CMD-SHELL pgrep node`) либо без healthcheck; `caddy`/`frontend` от воркера не зависят.
- SIGTERM: `enableShutdownHooks` → `consumer.stop()` — новые сообщения не берутся; сообщение в полёте при убийстве контейнера вернётся в очередь по visibility timeout (существующее поведение, redrive в DLQ после 3 доставок).

### D6. Dev-режим: независимый watch воркера через отдельный outDir

Два `nest start --watch` над одним `dist/` конфликтуют (`deleteOutDir: true` + гонки tsc). Воркер получает собственную пару конфигов: `nest-cli.worker.json` (entryFile `worker-main`) + `tsconfig.worker.json` (тот же src, `outDir: dist-worker`, в `.gitignore`). Скрипты:

- `@fuse/backend`: `"dev:worker": "nest start --watch --config nest-cli.worker.json"`.
- turbo: задача `dev:worker` (`cache: false, persistent: true`); корневой `"dev": "turbo run dev dev:worker"` — `pnpm dev` поднимает фронт, API и воркер; `pnpm dev:worker` — воркер отдельно.

Бонус к текущей боли из практики: рестарт `nest --watch` API больше не осиротляет запуск в полёте — исполнение живёт в отдельном процессе.

## Risks / Trade-offs

- [Tailable cursor — самописная инфраструктура: смерть курсора, пустая коллекция, реконнекты] → Изолировано в одном классе `BridgeTailer` с циклом пересоздания и бэкоффом; seed-документ при создании коллекции; события — «живость», истина — снапшот при подключении (уже существующий механизм), поэтому кратковременная потеря моста деградирует UX, но не корректность.
- [Облачная Mongo может не поддерживать capped/tailable (например, DocumentDB)] → Managed-MongoDB-провайдеры их поддерживают; интерфейс `EventBus`/`BridgeTailer` изолирует механизм — при неожиданности меняется один класс (например, на поллинг по `_id`), потребители не трогаются. Проверить на целевой базе при деплое.
- [Запуск деплоя без сервиса `worker` = запуски виснут в `pending`] → BREAKING отмечен в proposal; README и compose меняются в одном PR; в `docker-compose.yml` воркер входит в дефолтный `up`.
- [Один воркер убит посреди шага → запуск ждёт visibility timeout 2 ч] → Существующее поведение, не ухудшается; смягчение (heartbeat/ChangeMessageVisibility) — вне скоупа.
- [Двойная компиляция в деве (dist и dist-worker)] → Цена независимости watch-процессов; инкрементальный tsc делает её незаметной.
- [Конверты больше лимита BSON (16 МБ) при гигантских результатах шагов] → Payload событий — те же объекты, что уже пишутся в `Run.stepResults` (ограничены лимитом артефактов); файловые ответы уходят в S3 ссылками, а не телом.

## Migration Plan

1. Смёржить код (API перестаёт потреблять очередь только в новой версии образа).
2. Деплой: пересобрать образ, `docker compose up -d` с новым compose (backend + worker). Сообщения, накопившиеся в очереди за время рестарта, разберут воркеры — потери нет (очередь персистентна).
3. Масштабирование по потребности: `docker compose up -d --scale worker=N`.
4. Откат: предыдущий образ + предыдущий compose (воркер снова внутри API) — формат сообщений очереди не менялся.

## Open Questions

- Поддерживает ли облачная прод-Mongo capped/tailable (см. Risks — проверяется при деплое, есть изолированный запасной механизм).
