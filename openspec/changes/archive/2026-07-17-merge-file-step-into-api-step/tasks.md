# Tasks: merge-file-step-into-api-step

## 1. Worker

- [x] 1.1 `worker.service.ts`: multipart-сборка перенесена в `executeApiStep` (хелпер `attachMultipartBody`) — `UploadedFileRef` среди разрешённых входов переключает тело на `FormData`; без файла — прежний JSON-путь
- [x] 1.2 `worker.service.ts`: `case "file"` → `StepExecutionError` с подсказкой про api-шаг; `executeFileStep` и обработка `statusEndpoint` удалены
- [x] 1.3 `worker.service.ts`: `isPollFailed` — `status: "error" | "failed"` завершает опрос доменной ошибкой с телом ответа
- [x] 1.4 Тесты `worker-file-step.spec.ts` (6): файл+текст одним multipart, JSON без файла не меняется, привязочный фолбэк имени поля, композиция api+periodic с подстановкой `task_id` и прогрессом, терминальный error-статус, легаси file-шаг → ошибка

## 2. Билдер и типы

- [x] 2.1 `AddStepMenu.vue`: «Файл» убран из `STEP_TYPES`; `StepPicker.vue`: ветка создания file-шага удалена
- [x] 2.2 `packages/shared/src/types/index.ts`: `FileStep` помечен `@deprecated` (остаётся в union для чтения старых документов)

## 3. Миграция данных

- [x] 3.1 Сценарий «Распознать документ» (локальная Mongo): шаг 0 → `type: "api"` (`method`/`path`/`endpointId` восстановлены), добавлен шаг 1 `periodic` (`pollPath: "/task/{task_id}"`, `mappings: {task_id: "s0:task_id"}`, интервал 3 с)

## 4. Верификация

- [x] 4.1 Тесты зелёные (backend 174, shared 23), typecheck обоих пакетов чистый, lint без новых предупреждений
- [x] 4.2 Headless e2e против реального llm-doc-recognizer: api-шаг доставил PDF multipart'ом (`doc` + `data`), periodic-шаг опросил `/task/{task_id}` до `completed`, результат — распознанный текст («PRIVET FUSE»)
- [x] 4.3 Негатив: легаси file-шаг → `failed` с подсказкой про api-шаг (юнит-тест через `executeRun`, провайдер не вызывается)
