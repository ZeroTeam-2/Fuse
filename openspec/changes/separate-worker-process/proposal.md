# separate-worker-process

## Why

Воркер исполнения сценариев живёт внутри API-процесса: SQS-консьюмер стартует хуком жизненного цикла NestJS вместе с HTTP-сервером. Из-за этого исполнение сценариев нельзя масштабировать независимо от API — один процесс обслуживает и HTTP/WebSocket-трафик, и все одновременные запуски (параллелизм захардкожен `batchSize: 5`). Долгие запуски конкурируют с API за event loop, а рестарт API (в т.ч. `nest --watch` в деве) осиротляет запуски в полёте на весь visibility timeout (2 ч). Нужно отделить воркер в самостоятельный процесс и получить возможность запускать N воркеров под нагрузку.

## What Changes

- Второй entrypoint `worker-main.ts` в `@fuse/backend`: NestJS application context без HTTP-сервера, поднимающий только модули, нужные исполнению (Mongoose-схемы, MinIO, notifications, execution). Код не дублируется — воркер переиспользует существующие сервисы.
- `WorkerService` (SQS-консьюмер) исключается из API-процесса: `node dist/main` больше не потребляет очередь, `node dist/worker-main` — только потребляет.
- Доставка WS-событий из воркера клиентам через MongoDB: воркер публикует события (`step:start`, `step:done`, `page:required`, `run:*`, `notification:new`) в capped-коллекцию, API-процесс читает её tailable-курсором и транслирует в socket.io-комнаты. Прямые вызовы `RunGateway.publish()` / `NotificationsGateway.emitNew()` из кода воркера заменяются абстракцией публикации (`EventBus`), работающей в обоих процессах. (Официальный `@socket.io/mongo-adapter` отклонён: требует change streams → replica set, чего нет у дев-Mongo; см. design.)
- Параллелизм консьюмера становится конфигурируемым: `WORKER_CONCURRENCY` (env) вместо захардкоженного `batchSize: 5`.
- Горизонтальное масштабирование: несколько процессов-воркеров конкурентно читают одну SQS-очередь (компенсация за счёт семантики SQS — код не требует координации). `docker-compose.yml` получает отдельный сервис `worker` (тот же образ, другая команда, масштабируется `--scale worker=N`); сервис `backend` остаётся только API.
- Dev-скрипты: отдельный запуск воркера в watch-режиме рядом с API.
- **BREAKING** (для деплоя): контейнер `backend` сам по себе перестаёт исполнять сценарии — без запущенного сервиса `worker` запуски остаются в `pending`.

## Capabilities

### New Capabilities

_нет — изменение перекраивает существующие возможности, новых пользовательских способностей не добавляет._

### Modified Capabilities

- `scenario-execution`: требование «Очередь исполнения и архитектура main/worker» переписывается под фактическую архитектуру: очередь — SQS (спека дрейфовала: описывала BullMQ+Redis, реализация — SQS), воркер — отдельный процесс, параллелизм конфигурируем, поддерживается N воркеров на одной очереди. Требование «Real-time прогресс через WebSocket» дополняется: события воркера доходят до клиентов, чьи сокеты подключены к API-процессу, через межпроцессный канал поверх MongoDB — прямой вызов гейтвея в памяти больше не является допустимой реализацией.
- `backend-build-pipeline`: dist получает второй entry point `dist/worker-main.js`; формулировка «backend runs as a single process — no separate worker entry point» устраняется из Purpose и требований.
- `local-dev-environment`: локальная разработка запускает API и воркер отдельными процессами; запуск сценария из локального UI обрабатывается локальным воркер-процессом (рестарт API не роняет исполнение).

## Impact

- **Код**: `apps/backend/src/execution/worker.service.ts` (публикация событий через новую абстракцию), `execution.module.ts` (убрать `WorkerService` из API-графа), новый `worker-main.ts` + `WorkerAppModule`, `websocket/run.gateway.ts` и `notifications/notifications.gateway.ts` (подключение mongo-adapter), `config/env.schema.ts` (`WORKER_CONCURRENCY`), `notifications.service.ts` (эмит через канал).
- **Зависимости**: новых нет — мост событий строится на существующем mongoose-подключении; новая инфраструктура не добавляется.
- **Деплой**: `docker-compose.yml` — новый сервис `worker` (тот же Dockerfile, команда `node dist/worker-main`), `backend` больше не исполняет запуски. `apps/backend/Dockerfile` — без изменений образа, меняется только команда запуска сервиса worker.
- **Dev**: `package.json` скрипты (`dev:worker`), README-инструкции запуска.
- **Тесты**: юнит-тесты воркера (`apps/backend/test/worker-*.spec.ts`) — обновить DI-контекст; инфраструктурный smoke-тест.
