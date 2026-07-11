## 1. Базовый URL приложения (модель и парсер)

- [x] 1.1 Добавить `baseUrl?: string` в `App` (`apps/backend/src/apps/app.schema.ts`) и в тип приложения в `packages/shared/src/types/index.ts`
- [x] 1.2 В `apps/backend/src/apps/openapi-parser.ts` изменить сигнатуру на `parse(rawSpec, openapiUrl)` и добавить `extractBaseUrl(spec, openapiUrl)`: `new URL(spec.servers[0].url, openapiUrl)` при наличии `servers`, иначе `new URL(openapiUrl).origin`; нормализовать (убрать хвостовой `/`)
- [x] 1.3 Переписать `extractHost` как производное от `baseUrl` (`new URL(baseUrl).host`), сохранив текущее поведение поля `host`
- [x] 1.4 Прокинуть `openapiUrl` в оба вызова `parse()` в `apps/backend/src/apps/apps.service.ts` (импорт и реимпорт) и сохранять `baseUrl` в документ (строки ~86, ~100, ~168)
- [x] 1.5 Юнит-тест парсера: спека с абсолютным `servers[0].url` с base path; спека с относительным `servers[0].url`; спека без `servers` (реальный кейс `dadata-fake.cloud.astral-dev.ru/openapi.json`)

## 2. Бэкфилл существующих приложений

- [x] 2.1 Написать `apps/backend/scripts/backfill-app-base-url.mts`: пройти по всем `apps`, вывести `baseUrl` из `specSnapshot.servers` / `openapiUrl` по тому же правилу, пропустить документы с уже заполненным `baseUrl`
- [x] 2.2 Прогнать скрипт на рабочей БД; убедиться, что у приложения `Fake Dadata` (`6a5279373ea93f687f66a19f`) появился `baseUrl: https://dadata-fake.cloud.astral-dev.ru`, а у засеянных демо-приложений — `https://<host>`

## 3. Резолв URL в worker'е

- [x] 3.1 Зарегистрировать модель `App` в `ExecutionModule` (`MongooseModule.forFeature`) и инжектировать её в `WorkerService`; инжектировать `SsrfGuard`
- [x] 3.2 Добавить в `WorkerService` приватный `resolveAppUrl(appId, path)`: загрузка `App` с кэшем `Map<appId, AppDocument>` на время одного `executeRun`; склейка `baseUrl` + `path` с сохранением base path приложения и схлопыванием двойных слэшей
- [x] 3.3 Бросать доменную ошибку с понятным текстом, если приложение не найдено или `baseUrl` пуст (называть приложение, предлагать переимпорт) — вместо низкоуровневого `Failed to parse URL`
- [x] 3.4 Прогнать резолвнутый URL через `SsrfGuard` перед `fetch`
- [x] 3.5 Использовать резолвер в `executeApiStep` (`step.path`) — заменить `this.buildUrl(step.path, resolved)` на построение от абсолютной базы
- [x] 3.6 Использовать резолвер в `executePeriodicStep` (`step.pollPath`) и подготовить точку для `file`-шага (`uploadPath`, `statusEndpoint.path`)
- [x] 3.7 Юнит-тест: `api`-шаг с относительным путём и приложением с `baseUrl` даёт абсолютный URL; приложение без `baseUrl` даёт доменную ошибку

## 4. Идемпотентность и обработка ошибок в worker'е

- [x] 4.1 В начале `executeRun` инициализировать `stepResults` массивом длины `steps.length` со статусом `pending` (если длина не совпадает с числом шагов сценария)
- [x] 4.2 Заменить `pushRunStep` + `setRunStep` (позиционный `$`) на адресную запись `$set: { "stepResults.<i>": ... }` по известному индексу шага
- [x] 4.3 Ввести `StepExecutionError` для доменных ошибок шага; в `executeRun` ловить её, вызывать `failRun` и **возвращать управление** без `throw` (сообщение подтверждается, повторной доставки нет)
- [x] 4.4 Инфраструктурные ошибки (не `StepExecutionError`) по-прежнему пробрасывать наружу — retry/DLQ сохраняются
- [x] 4.5 В `executeRun` не запускать шаги, если `Run` уже в терминальном статусе (`completed`, `failed`, `cancelled`) — защита от повторной доставки, откатывающей статус
- [x] 4.6 Считать `totalDurationMs` в событии `run:done` как сумму `durationMs` шагов (сейчас захардкожен `0`)

## 5. Снапшот состояния при подключении к WebSocket

- [x] 5.1 Зарегистрировать модель `Run` в `WebSocketModule` (`MongooseModule.forFeature`) и инжектировать её в `RunGateway`
- [x] 5.2 В `RunGateway.handleConnection` после `client.join('run:<id>')` прочитать `Run` и отправить **этому сокету** событие `run:status` со снапшотом: `status`, `currentStep`, `stepResults`, `error`
- [x] 5.3 Добавить `error?: string` в payload `run:status` (`packages/shared/src/events/index.ts`)
- [x] 5.4 Тест: подключение к `runId` уже завершённого (`failed`) запуска отдаёт снапшот со статусом и текстом ошибки

## 6. RunPanel: восстановление состояния и вывод результата

- [x] 6.1 В `handleWsEvent` (`apps/frontend/components/RunPanel.vue`) обработать снапшот `run:status`: восстановить `stepProgress` из `payload.stepResults` (по `stepIndex`), не понижая уже достигнутые статусы шагов
- [x] 6.2 Выставлять фазу из снапшотного статуса, включая `failed` до подключения сокета — брать текст в `errorMessage` из `payload.error`
- [x] 6.3 Переписать `resultItems`: выводить полезную нагрузку последнего успешного шага (объект → пары «поле → значение»; массив объектов → счётчик записей и предпросмотр; скаляр → как есть), а не только длительности
- [x] 6.4 Показывать общее время из `run:done.totalDurationMs` (после задачи 4.6 оно перестанет быть нулём)

## 7. Владелец запуска

- [x] 7.1 В `ExecutionService.getRun` принимать `userId` и сверять с `run.userId` → `ForbiddenException` при несовпадении; прокинуть `req.user.userId` из `ExecutionController.findById`
- [x] 7.2 Тест: чужой `runId` возвращает 403

## 8. Проверка сквозного потока

- [x] 8.1 `pnpm --filter @fuse/backend run typecheck` и `pnpm --filter @fuse/frontend run typecheck` — без ошибок
- [x] 8.2 `pnpm lint` — без ошибок
- [x] 8.3 `pnpm --filter @fuse/backend run test` — все тесты проходят
- [x] 8.4 Сквозная проверка в UI: сценарий из одного шага «Получить список организаций» (`Fake Dadata`, `GET /collections`) доходит до `completed` и показывает данные организаций
- [x] 8.5 Проверить, что в БД у нового запуска ровно один элемент `stepResults` на шаг, статус `completed`, ошибок нет
- [x] 8.6 Проверить негативный кейс: приложение без `baseUrl` → на экране понятная ошибка (не «Failed to parse URL»)
- [x] 8.7 Проверить восстановление: перезагрузить страницу во время выполнения — прогресс и итоговое состояние восстанавливаются из снапшота
