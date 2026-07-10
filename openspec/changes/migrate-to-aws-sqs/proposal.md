## Why

Сценарии исполняются через BullMQ + Redis в отдельном worker-процессе. BullMQ жёстко завязывает очередь на Redis, что усложняет масштабирование в AWS-инфраструктуре и требует самостоятельного управления Redis-кластером. AWS SQS — это managed-сервис очередей, который убирает операционную нагрузку (backup, failover, мониторинг Redis) и нативно интегрируется с остальной AWS-инфраструктурой проекта. Поверхность миграции минимальна: одна очередь (`scenario-execution`), один тип job'а (`execute` с payload `{ runId }`), нет cron/repeatable-задач.

## What Changes

- **BREAKING**: Заменить BullMQ на AWS SQS как транспорт очереди исполнения сценариев (`scenario-execution`).
- Producer (`ExecutionService`) отправляет SQS-сообщение `{ runId }` вместо `queue.add(...)`.
- Consumer (`WorkerService`) опрашивает SQS вместо BullMQ `Worker`; concurrency 5 сохраняется.
- Удалить зависимость `bullmq` из `apps/backend`.
- Добавить AWS SDK v3 `@aws-sdk/client-sqs` (+ опционально `sqs-consumer` для polling-loop).
- Ввести переменные окружения: `AWS_SQS_QUEUE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Удалить сервис Redis из `docker-compose.yml` (Redis остаётся только для WebSocket pub/sub — `RedisPubSubService` и `RunGateway` не затрагиваются).
- Обновить `.env.example`, `env.schema.ts`, `README.md`.
- Адаптировать тесты (`run-status.spec.ts`) — заменить mock `bullmq` на mock SQS-клиента.
- Отмена запуска (`cancelRun`): вместо `queue.getJob` + `job.remove()` — статус `CANCELLED` уже проверяется внутри worker'а, поэтому producer только выставляет статус; SQS-сообщение не удаляется явно.

## Capabilities

### New Capabilities

(нет новых capabilities — инфраструктурная миграция в рамках существующей capability)

### Modified Capabilities

- `scenario-execution`: требование «Очередь исполнения и архитектура main/worker» меняет транспорт очереди с BullMQ + Redis на AWS SQS; producer и consumer переходят на SQS API; retry-стратегия и visibility timeout задаются через конфигурацию SQS-очереди.

## Impact

- **Код**: `apps/backend/src/execution/execution.service.ts` (producer), `apps/backend/src/execution/worker.service.ts` (consumer), `apps/backend/src/config/env.schema.ts` (новые env-переменные).
- **Зависимости**: удалить `bullmq`; добавить `@aws-sdk/client-sqs` (+ `sqs-consumer`). `ioredis` остаётся (используется `redis-pubsub.service.ts`).
- **Инфраструктура**: `docker-compose.yml` — сервис `redis` остаётся (pub/sub), но больше не обслуживает очередь; требуется создать SQS-очередь `scenario-execution.fifo` в AWS-аккаунте (IaC или вручную).
- **Тесты**: `apps/backend/test/run-status.spec.ts` — обновить mock.
- **Конфигурация**: `.env.example`, `README.md` — документировать новые AWS env-переменные.
- **Не затрагивается**: WebSocket pub/sub (`redis-pubsub.service.ts`, `run.gateway.ts`), движок исполнения шагов, загрузка файлов, UI.
