# Tasks: implement-file-step-upload

## 1. Shared-типы

- [x] 1.1 `packages/shared/src/types/index.ts`: тип `UploadedFileRef` (`objectName`, `fileName`, `fileSize`, `fileType`) + type guard `isUploadedFileRef`
- [x] 1.2 `PageBlock`: опциональные поля валидации dropzone — `accept?: string[]`, `maxFileMb?: number` (JSDoc: только для `dropzone`)

## 2. Backend: чтение из MinIO и исполнение файлового шага

- [x] 2.1 `minio.service.ts`: метод `getObjectBuffer(objectName)` (`client.getObject` → Buffer)
- [x] 2.2 `worker.service.ts`: в `executeFileStep` найти `UploadedFileRef` во входах шага (по `binding` dropzone-блока / первая файловая ссылка); нет ссылки — `StepExecutionError` «файл не был загружен»
- [x] 2.3 `worker.service.ts`: сборка multipart-запроса — `buildEndpointRequest(step, uploadMethod, uploadPath, resolved, ctx)`, тело заменяется на `FormData` (файл `Blob(contentType)` под именем body-входа бинарного формата, фолбэк `"file"`; остальные body-входы — текстовые поля), `Content-Type: application/json` из заголовков удаляется
- [x] 2.4 `worker.service.ts`: вызов провайдера, обработка не-2xx как в api-шаге; ответ (JSON/текст) — результат загрузки; presigned URL/objectName в результат шага не попадают
- [x] 2.5 `worker.service.ts`: общий хелпер цикла опроса (вынесен `pollUntilComplete` из `executePeriodicStep`); при `statusEndpoint` — опрос `method`+`path` с `intervalSec`, `progress`-события по `progressField`, входы опроса дополняются выходами ответа загрузки; результат шага — последний ответ опроса
- [x] 2.6 Юнит-тесты worker'а: файл доставлен провайдеру (multipart-поле, текстовые поля рядом), опрос статуса с подстановкой id, ошибка «файл не был загружен» (`test/worker-file-step.spec.ts`, 11/11 c существующими)

## 3. Frontend: загрузчик и PageRunner

- [x] 3.1 Composable `useFileUpload`: single (`POST /api/uploads/single`, XHR-прогресс) и chunked (`init` → части по `uploadPartSizeMb` из runtime-конфига → `complete`), выбор режима по `runtimeConfig.public.fileSingleUploadMaxMb`, состояние (проценты, байты, статус)
- [x] 3.2 `useFileUpload`: пауза/продолжение, отмена (`abort`), возобновление после обрыва (`GET /api/uploads/chunked/:id` → продолжить с первой недостающей части), сообщение «Соединение прервалось на X% — загруженные чанки сохранены»
- [x] 3.3 `PageRunner.vue`: `onFile` — валидация по `accept`/`maxFileMb` блока (ошибка без старта загрузки), запуск загрузки, UI прогресса/паузы/отмены в dropzone; результат загрузки уходит в payload сабмита (dropzone блокирует сабмит через `blockValue`)
- [x] 3.4 Инспектор dropzone-блока в конструкторе страниц: поля «Допустимые форматы» и «Макс. размер (МБ)»; подпись ограничений в dropzone на странице исполнения

## 4. Верификация

## 5. Доработки по живому прогону (llm-doc-recognizer)

- [x] 5.1 `worker.service.ts`: имя multipart-поля — фолбэк на привязку dropzone-блока, когда схема не пометила body-вход файловым (спеки, импортированные до 5.2, хранят `doc` строкой); юнит-тест
- [x] 5.2 `openapi-parser.ts`: `type: string, format: binary|base64` → `SchemaField.type: "file"`; юнит-тест
- [x] 5.3 E2e против реального `http://[адрес-скрыт]/llm-doc-recognizer`: сценарий «Распознать документ» (шаг сконвертирован в `file` прямо в БД — в билдере пока нет конфигуратора файлового шага), single-загрузка PDF → multipart в поле `doc` + `data`-константа → опрос `/task/{task_id}` до `completed` → результат шага = распознанный текст
- [x] 5.4 ~~Конфигуратор файлового шага в билдере~~ — закрыт change'ем `merge-file-step-into-api-step` упразднением: тип «Файл» удалён из палитры, файловый endpoint настраивается штатной панелью api-шага (multipart включается по `UploadedFileRef` во входах)
- [x] 5.5 Терминальные статусы опроса — закрыт change'ем `merge-file-step-into-api-step` (задача 1.3): `isPollFailed` роняет опрос доменной ошибкой на `status: "error" | "failed"`, не дожидаясь 5-минутного таймаута

- [x] 4.1 Мок-API провайдера на localhost:8091 (в `SSRF_ALLOWED_HOSTS`): multipart-приём с разбором частей + endpoint статуса (processing/50 → done/100) + журнал `/calls`
- [x] 4.2 Headless-прогон (JWT в куке `access_token`): single-загрузка → сабмит → worker доставил файл моку (поле `document` из схемы, текстовый body- и header-входы рядом, байты целиком) → опрос статуса с подстановкой `taskId`, ≥2 итераций → результат шага = финальный ответ, без `objectName`/URL хранилища
- [x] 4.3 Headless-прогон chunked: файл 17 МБ (> порога 15 из `.env`), обрыв после части 1, resume по `GET /chunked/:id` (1 часть, байты совпали), докачка частей 2–4, complete, worker доставил провайдеру все байты
- [x] 4.4 Негативные случаи: сабмит без загрузки → `failed` с «файл не был загружен», провайдер не вызывался; валидация `accept`/`maxFileMb` вынесена в shared `validateFileAgainstBlock` + юнит-тесты; `pnpm lint` (без новых предупреждений) и все тесты зелёные (shared 23, backend 170). Примечание: `/api/uploads/single` не проверяет content-type на сервере (`isAllowedContentType` не вызывается) — существовавший до изменения пробел, вне скоупа
