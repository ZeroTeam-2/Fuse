# Proposal: implement-file-step-upload

## Why

Файловый шаг сценария не работает end-to-end: файл, выбранный в dropzone на странице шага, не покидает браузер ([PageRunner.vue](../../../apps/frontend/components/run/PageRunner.vue) кладёт в `page:submit` только метаданные `{fileName, fileSize, fileType}`), а исполнение файлового шага в worker — заглушка `{placeholder: true}` ([worker.service.ts](../../../apps/backend/src/execution/worker.service.ts) `executeFileStep`). При этом требования давно зафиксированы в спеках (`scenario-execution` «Загрузка файлов (single и chunked)», `scenario-builder` «Типы шагов» п. 4), а серверное API загрузки в MinIO (`/api/uploads/single`, `/api/uploads/chunked/*` с возобновляемыми сессиями в Mongo) уже полностью реализовано и не используется никем, кроме тестов.

## What Changes

- **Frontend (PageRunner + загрузка)**: dropzone реально загружает файл на бэкенд до сабмита страницы — ≤ порога `FILE_SINGLE_UPLOAD_MAX_MB` одним `multipart/form-data`-запросом на `/api/uploads/single`, больше порога — чанками через существующий `/api/uploads/chunked/*` (init → part → complete) с прогрессом (проценты и байты), паузой/возобновлением и отменой; при обрыве соединения сессия сохраняется, и загрузка возобновляется с места обрыва (`GET /api/uploads/chunked/:uploadId`). В `page:submit` вместо голых метаданных уходит ссылка на загруженный объект `{objectName, fileName, fileSize, fileType}`.
- **Валидация файла из настроек страницы**: у блока `dropzone` появляются настройки допустимых форматов и лимита размера (инспектор конструктора страниц); PageRunner проверяет файл до начала загрузки, порог single/chunked берётся из публичного runtime-конфига (`file-size-limits` уже опубликовал его фронтенду).
- **Worker (`executeFileStep`)**: полная реализация — по привязке dropzone-блока worker находит ссылку на объект в MinIO, скачивает его и отправляет в API провайдера `multipart/form-data`-запросом (`uploadMethod` + `uploadPath` через существующий механизм `buildEndpointRequest`/`resolveStepUrl`: абсолютный URL, SSRF-проверка, остальные входы шага раскладываются по path/query/header/body рядом с файлом); при заданном `statusEndpoint` — стадия обработки: опрос по образцу `executePeriodicStep` с интервалом, полем прогресса и публикацией `progress`-событий в WebSocket; ответ провайдера сохраняется как результат шага.
- **MinIO-сервис**: добавляется чтение объекта (download/stream) — сейчас есть только запись и presigned URL.

## Capabilities

### New Capabilities

_нет — все требования ложатся в существующие спеки._

### Modified Capabilities

- `scenario-execution`: уточняется требование «Загрузка файлов (single и chunked)» (загрузка идёт до сабмита страницы, в шаг передаётся ссылка на объект) и добавляется требование исполнения файлового шага worker'ом (доставка файла провайдеру multipart-запросом, SSRF, опрос `statusEndpoint`, прогресс, результат).
- `step-pages`: блок `dropzone` получает настройки допустимых форматов и лимита размера в инспекторе свойств; PageRunner применяет их при выборе файла.

## Impact

- **Код**: `apps/frontend/components/run/PageRunner.vue` (+ новый composable загрузки), `apps/frontend/components` (инспектор dropzone в конструкторе страниц), `apps/backend/src/execution/worker.service.ts` (`executeFileStep`), `apps/backend/src/minio/minio.service.ts` (чтение объекта), `packages/shared/src/types/index.ts` (`PageBlock`: поля валидации файла; тип ссылки на загруженный файл).
- **API**: существующие `/api/uploads/*` начинают использоваться фронтендом; новых публичных endpoint'ов не появляется.
- **Зависимости/инфраструктура**: локальный MinIO уже поднят (`pnpm infra`, `S3_*` в `.env.local`); вызовы провайдера проходят `ssrfGuard.assertSafeUrl` (dev-обход — `SSRF_ALLOWED_HOSTS`).
- **Обратная совместимость**: старые запуски с сохранёнными метаданными файла без `objectName` — файловый шаг завершается доменной ошибкой с понятной диагностикой (файл не был загружен), как и раньше фактически не работал.
