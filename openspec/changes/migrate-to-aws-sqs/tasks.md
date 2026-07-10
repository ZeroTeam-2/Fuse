## 1. Зависимости

- [x] 1.1 Удалить `bullmq` из `apps/backend/package.json`
- [x] 1.2 Добавить `@aws-sdk/client-sqs` и `sqs-consumer` в `apps/backend/package.json`
- [x] 1.3 Выполнить `pnpm install` и проверить lockfile

## 2. Конфигурация окружения

- [x] 2.1 Добавить в `apps/backend/src/config/env.schema.ts`: `AWS_REGION` (default `us-east-1`), `AWS_SQS_QUEUE_URL` (required), `AWS_ACCESS_KEY_ID` (default `test`), `AWS_SECRET_ACCESS_KEY` (default `test`), `AWS_ENDPOINT_URL` (default `""`, для LocalStack)
- [x] 2.2 Обновить `.env.example` — задокументировать новые AWS-переменные, обновить комментарий для `REDIS_URL` (только pub/sub)
- [x] 2.3 Обновить `README.md` — таблица переменных окружения

## 3. SQS Producer (ExecutionService)

- [x] 3.1 Заменить импорт `bullmq` на `@aws-sdk/client-sqs`; создать `SQSClient` в конструкторе `ExecutionService` (endpoint URL из конфига для LocalStack)
- [x] 3.2 Заменить `this.queue.add("execute", { runId }, { jobId })` на `sqsClient.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify({ runId }) }))`
- [x] 3.3 Удалить логику отмены через очередь в `cancelRun` — убрать `queue.getJob` / `job.remove()`; оставить только установку статуса `CANCELLED` в MongoDB
- [x] 3.4 Удалить константу `SCENARIO_EXECUTION_QUEUE` из `execution.service.ts` (или заменить на чтение `AWS_SQS_QUEUE_URL` из конфига)

## 4. SQS Consumer (WorkerService)

- [x] 4.1 Заменить импорт `bullmq` (`Worker`, `Job`) на `sqs-consumer` (`Consumer`) и `@aws-sdk/client-sqs` (`SQSClient`)
- [x] 4.2 В `start()` создать `Consumer.create()` с параметрами: `queueUrl`, `handleMessage`, `concurrency: 5`, `batchSize: 5`, `waitTimeSeconds: 20`, `visibilityTimeout: 7200`
- [x] 4.3 В `handleMessage` извлечь `runId` из `JSON.parse(message.Body)`, вызвать `this.executeRun(runId)`; при ошибке — throw (сообщение вернётся в очередь); при успехе — сообщение авто-удаляется
- [x] 4.4 Заменить `this.worker.on("completed"/"failed")` на события `Consumer` (`"message_processed"`, `"processing_error"`, `"error"`)
- [x] 4.5 В `stop()` заменить `this.worker.close()` на `this.consumer.stop()`

## 5. Инфраструктура (docker-compose)

- [x] 5.1 Добавить сервис `localstack` в `docker-compose.yml` (image: localstack/localstack, порты 4566, env: `SERVICES=sqs`)
- [x] 5.2 Добавить init-скрипт или entrypoint для создания очереди `scenario-execution` и DLQ `scenario-execution-dlq` (RedrivePolicy, maxReceiveCount=3, VisibilityTimeout=7200) через `awslocal sqs create-queue`
- [x] 5.3 Добавить переменные окружения в backend-сервис: `AWS_SQS_QUEUE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`
- [x] 5.4 Обновить `depends_on` backend — Redis остаётся (pub/sub), добавить localstack
- [x] 5.5 Добавить named volume `fuse-localstack-data` при необходимости

## 6. Тесты

- [x] 6.1 В `apps/backend/test/run-status.spec.ts` заменить mock `bullmq` на mock `@aws-sdk/client-sqs` (`SQSClient`, `SendMessageCommand` — `send` возвращает `Promise.resolve()`)
- [x] 6.2 Обновить mock `ConfigService` — возвращать значения для `AWS_SQS_QUEUE_URL`, `AWS_REGION` вместо `REDIS_URL`
- [x] 6.3 Убедиться, что `cancelRun` больше не вызывает `queue.getJob` (проверить что тест проходит без mock-очереди)

## 7. Проверка и деплой

- [x] 7.1 Запустить `pnpm --filter @fuse/backend run typecheck` — убедиться в отсутствии ошибок типов
- [x] 7.2 Запустить `pnpm --filter @fuse/backend run lint` — исправить lint-ошибки
- [x] 7.3 Запустить `pnpm --filter @fuse/backend run test` — все тесты проходят
- [ ] 7.4 Локальная проверка: поднять `docker compose up`, запустить сценарий через UI, убедиться что job проходит через SQS → worker → WebSocket события
- [ ] 7.5 Проверить отмену: запустить сценарий, отменить его, убедиться что worker корректно завершает обработку
