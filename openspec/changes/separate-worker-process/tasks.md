# separate-worker-process — tasks

## 1. Шина событий (EventBus + мост через Mongo)

- [ ] 1.1 Создать `src/events/`: интерфейс `EventBus` (`publishRun(runId, ServerWsEvent)`, `publishNotification(userId, NotificationNewPayload)`), DI-токен `EVENT_BUS`, константы моста (имя capped-коллекции `ws_events_bridge`, размер, тип конверта `{ns, room, event, payload, createdAt}`)
- [ ] 1.2 Реализовать `LocalEventBus` (API): делегирует в `RunGateway.emitToRun` и `NotificationsGateway` (комната `user:{userId}`)
- [ ] 1.3 Реализовать `MongoBridgeEventBus` (воркер): идемпотентное создание capped-коллекции (сид-документ, игнор `NamespaceExists`) + `insertOne` конверта через mongoose-подключение
- [ ] 1.4 Реализовать `BridgeTailer` (API, `OnApplicationBootstrap`/`OnApplicationShutdown`): tailable cursor c `awaitData` от последнего `_id`, цикл пересоздания с бэкоффом при смерти курсора, маршрутизация конвертов в `LocalEventBus`
- [ ] 1.5 Собрать `EventsModule.forApi()` / `EventsModule.forWorker()` (dynamic module): API — `LocalEventBus` + `BridgeTailer`, воркер — `MongoBridgeEventBus`

## 2. Развязка потребителей от гейтвеев

- [ ] 2.1 `WorkerService`: заменить инжекцию `RunGateway` на `EVENT_BUS` (метод `publish` → `bus.publishRun`)
- [ ] 2.2 `NotificationsService`: заменить инжекцию `NotificationsGateway` на `EVENT_BUS` (`emitNew` → `bus.publishNotification`); `NotificationsModule` больше не пробрасывает гейтвей в сервис
- [ ] 2.3 Проверить `ExecutionService` и прочие API-side публикации (cancel, submit): перевести на `EVENT_BUS` там, где сейчас прямой вызов гейтвея
- [ ] 2.4 Обновить юнит-тесты (`worker-*.spec.ts`, run-status, run-history и др.): мок `EVENT_BUS` вместо моков гейтвеев

## 3. Второй entrypoint воркера

- [ ] 3.1 Создать `WorkerAppModule`: ConfigModule (та же `validateEnv`), MongooseModule, MinioModule, NotificationsModule, `EventsModule.forWorker()`, модели Run/Scenario/App, `WorkerService`, `ManualInputsService`, `SsrfGuard` — без контроллеров, guards, Swagger
- [ ] 3.2 Создать `src/worker-main.ts`: `NestFactory.createApplicationContext(WorkerAppModule)` + `enableShutdownHooks()` + лог старта
- [ ] 3.3 Убрать `WorkerService` из `ExecutionModule` (API-процесс перестаёт потреблять очередь); `AppModule` подключает `EventsModule.forApi()`
- [ ] 3.4 `WORKER_CONCURRENCY` в `env.schema.ts` (1–10, дефолт 5) и использование в `WorkerService.start()` вместо захардкоженного `batchSize: 5`
- [ ] 3.5 Проверить `nest build`: в `dist/` присутствуют `main.js` и `worker-main.js`; `pnpm --filter @fuse/backend typecheck` зелёный

## 4. Dev-скрипты

- [ ] 4.1 Добавить `nest-cli.worker.json` (entryFile `worker-main`, без deleteOutDir-конфликтов) + `tsconfig.worker.json` (`outDir: dist-worker`); `dist-worker` в `.gitignore`
- [ ] 4.2 Скрипт `dev:worker` в `@fuse/backend` (`nest start --watch --config nest-cli.worker.json`), задача `dev:worker` в `turbo.json` (`cache: false`, `persistent: true`), корневые скрипты: `pnpm dev` поднимает фронт+API+воркер, `pnpm dev:worker` — отдельно
- [ ] 4.3 Живая проверка по skill `verify`: `pnpm dev` (или API+воркер в двух терминалах), запуск сценария из UI доходит до терминального статуса, события шагов и колокольчик приходят без перезагрузки; рестарт API-watch посреди запуска не прерывает исполнение

## 5. Деплой

- [ ] 5.1 `docker-compose.yml`: сервис `worker` (тот же Dockerfile/образ, `command: ["node", "apps/backend/dist/worker-main"]`, без `container_name` и `ports`, та же env, что у `backend`); при необходимости healthcheck на живость процесса
- [ ] 5.2 Проверить полный стек в докере: `docker compose up` — запуск сценария исполняется воркер-контейнером, события доходят до UI; `--scale worker=2` работает
- [ ] 5.3 Обновить README (архитектура, команды запуска, масштабирование воркеров) и `.env.local.example`/доки при появлении `WORKER_CONCURRENCY`

## 6. Финал

- [ ] 6.1 Прогнать `pnpm test`, `pnpm typecheck`, `pnpm lint`; infra-smoke (`pnpm test:infra`) при поднятой инфраструктуре
- [ ] 6.2 `openspec validate --change separate-worker-process`; актуализировать design.md, если реализация отклонилась (в т.ч. проверить поведение tailable cursor на целевой облачной Mongo — открытый вопрос design)
