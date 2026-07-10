## Context

Исполнение сценариев построено на архитектуре main process + worker process. Сейчас BullMQ + Redis служат транспортом очереди: `ExecutionService` (main) создаёт `Run` и кладёт job в очередь; `WorkerService` (worker) забирает job, исполняет шаги, сохраняет промежуточное состояние в MongoDB. Redis **параллельно** используется для WebSocket pub/sub (`RedisPubSubService`, `RunGateway`) — этот канал не затрагивается миграцией.

Поверхность миграции минимальна: одна очередь (`scenario-execution`), один тип job'а (`execute`, payload `{ runId }`), нет cron/repeatable-задач. BullMQ-функции `getJob` + `job.remove()` для отмены не имеют прямого SQS-аналога, но worker уже проверяет `run.status === CANCELLED` в начале и на каждой итерации цикла шагов.

## Goals / Non-Goals

**Goals:**
- Заменить BullMQ на AWS SQS как транспорт очереди `scenario-execution`.
- Сохранить текущую семантику: main enqueue, worker dequeue, concurrency 5, возобновление с последнего шага после падения.
- Сохранить Redis для WebSocket pub/sub без изменений.
- Обеспечить локальную разработку без реального AWS-аккаунта (LocalStack).

**Non-Goals:**
- Замена Redis pub/sub на другой транспорт (SNS, EventBridge и т.д.).
- Изменение движка исполнения шагов, логики retry шагов, обработки ошибок.
- Изменение API-контрактов (`POST /api/runs`, WebSocket events).
- Введение FIFO-упорядочивания или приоритизации очередей.

## Decisions

### D1: Standard Queue (не FIFO)

**Выбор**: SQS Standard Queue.

**Почему**: Запуски сценариев независимы и не требуют глобального порядка. Worker идемпотентен: он проверяет `run.status` на старте и в цикле, поэтому повторная доставка (at-least-once) безопасна. FIFO добавляет накладные расходы (throughput limit 300 TPS, дороже) без реальной пользы для одного параллельного worker'а.

**Альтернатива**: FIFO с content-based deduplication по `runId`. Отвергнута — текущий BullMQ-код использует `jobId = runId` для дедупликации, но это предотвращает только дублирование при enqueue. Повторная обработка уже безопасна.

### D2: Библиотека `sqs-consumer` для polling-loop

**Выбор**: `sqs-consumer` (BBC/node-sqs-consumer) поверх `@aws-sdk/client-sqs`.

**Почему**: Библиотека инкапсулирует polling-loop (long polling с WaitTimeSeconds=20), batch-приём (до 10 сообщений), авто-удаление после успешной обработки, вызов обработчика ошибок и graceful shutdown. Это заменяет BullMQ `Worker` с минимальным кодом. Альтернатива — ручная реализация `ReceiveMessage` → process → `DeleteMessage` цикла — добавляет ~60 строк boilerplate без выгоды.

**Параметры consumer**:
- `concurrency: 5` (как в текущем BullMQ Worker)
- `batchSize: 5` (до 5 сообщений за poll, чтобы совпало с concurrency)
- `waitTimeSeconds: 20` (long polling)
- `visibilityTimeout` — см. D3

### D3: Visibility Timeout = 2 часа

**Выбор**: Visibility timeout 7200 секунд (2 часа) на уровне очереди.

**Почему**: Максимальное время одного job'а = `PAGE_INPUT_TIMEOUT_MS` (30 мин ожидания ввода пользователя) + сумма `POLL_TIMEOUT_MS` (5 мин на periodic-шаг). Worst-case сценарий с 5 periodic-шагами и одной страницей ввода — ~55 минут. 2 часа даёт комфортный запас. SQS max = 12 часов (43 200 сек).

**Альтернатива**: Heartbeat через `ChangeMessageVisibility` каждые N минут. Отвергнута — добавляет сложность; 2-часового таймаута достаточно для текущих сценариев. Если в будущем появятся job'ы длиннее 2 часов — revisited.

### D4: Dead Letter Queue (DLQ)

**Выбор**: Отдельная DLQ `scenario-execution-dlq` с `maxReceiveCount: 3`.

**Почему**: После 3 неудачных доставок (worker упал, не вызвал delete) сообщение уходит в DLQ для ручного разбора. BullMQ сейчас не имеет явной retry-конфигурации (по умолчанию retries не настроены), но SQS-модель требует явной стратегии. 3 попытки — разумный баланс между resilience и предотвращением poison-pill.

### D5: Отмена запуска — только статус, без удаления сообщения

**Выбор**: `cancelRun` выставляет `run.status = CANCELLED` в MongoDB и больше не пытается удалить сообщение из очереди.

**Почему**: SQS не позволяет удалить сообщение по content/ID — нужен `ReceiptHandle`, доступный только consumer'у. Worker уже проверяет `run.status === CANCELLED` в `executeRun` (start) и в цикле шагов (mid-execution), поэтому сообщение будет доставлено, но обработчик сразу завершится без побочных эффектов.

### D6: Локальная разработка через LocalStack

**Выбор**: Контейнер `localstack` в `docker-compose.yml` для эмуляции SQS. Скрипт `infra` создаёт очередь при старте.

**Почему**: Разработчикам не нужен AWS-аккаунт для локальной работы. Переменная `AWS_ENDPOINT_URL` указывает SDK на LocalStack (`http://localhost:4566`). В production переменная не задаётся — SDK использует дефолтный AWS endpoint.

### D7: AWS SDK v3

**Выбор**: `@aws-sdk/client-sqs` (v3 modular).

**Почему**: AWS SDK v3 — текущий стандарт, tree-shakeable, поддерживает `AWS_ENDPOINT_URL` для LocalStack. Credentials берутся из стандартного chain (env vars → IAM role → ~/.aws/credentials).

## Risks / Trade-offs

- **[Дублирование обработки]** SQS Standard гарантирует at-least-once. → Worker идемпотентен: проверяет `run.status` перед стартом и в цикле. Если run уже `COMPLETED`/`CANCELLED` — обработчик завершается немедленно.
- **[Длительные job'ы > 2 часов]** Visibility timeout истечёт, сообщение станет видимым для другого consumer'а. → 2 часа покрывает все текущие сценарии (max ~55 мин). Мониторинг DLQ предотвратит тихую потерю.
- **[Удаление BullMQ ломает тесты]** `run-status.spec.ts` мокает `bullmq`. → Тесты обновляются: mock заменяется на mock SQS-клиента. Поверхность мока та же (`sendMessage` вместо `add`, нет `getJob`).
- **[LocalStack vs реальный SQS]** Поведение LocalStack может отличаться edge-case'ами. → CI может использовать реальный SQS (через GitHub OIDC) или эфемерный LocalStack; для unit-тестов SQS полностью мокается.
- **[Зависимость от AWS-кредов в окружении]** Без кредов приложение не запустится. → Для dev-окружения creds = test values для LocalStack; в production — IAM role на ECS/EC2.

## Migration Plan

1. **Подготовка инфраструктуры**: создать SQS-очередь `scenario-execution` + DLQ в AWS (или Terraform/CDK).
2. **Код**: реализовать изменения (producer, consumer, env, deps).
3. **Тесты**: обновить mock'и, прогнать unit-тесты.
4. **Локальная проверка**: поднять docker-compose с LocalStack, проверить end-to-end запуск сценария.
5. **Деплой**: задать `AWS_SQS_QUEUE_URL` и AWS-креды в окружении, задеплоить backend + worker.
6. **Откат**: revert кода + вернуть `REDIS_URL` для BullMQ. Redis уже работает (pub/sub), так что откат не требует инфраструктурных изменений.

## Open Questions

- Нужен ли отдельный worker-контейнер в `docker-compose.yml`? Сейчас worker запускается только через npm-скрипты (`start:worker`, `dev:worker`), в compose нет отдельного worker-сервиса. Решение можно отложить — не блокирует миграцию.
- IaC для создания SQS-очереди (Terraform/CDK/SAM)? За рамками этого change — инфраструктура создаётся вручную или отдельным PR.
