# Design: implement-file-step-upload

## Context

Серверное API загрузки готово целиком: `POST /api/uploads/single` (multipart, ≤ `FILE_SINGLE_UPLOAD_MAX_MB`), `POST /api/uploads/chunked/init|/:id/part/:n|/:id/complete|/:id/abort`, `GET /api/uploads/chunked/:id` (статус для resume). Сессии чанков живут в Mongo (`UploadSession`: objectName, minioUploadId, parts[etag,size]), объекты — в MinIO/S3 (`pnpm infra`, бакет создаётся автоматически). Результат обеих веток — `{objectName, url}` (url — presigned GET на 24 ч).

Не хватает трёх звеньев:

1. **PageRunner** держит `File` в локальной переменной и отправляет в `page:submit` только метаданные.
2. **`executeFileStep`** — заглушка; при этом вся обвязка для вызова провайдера уже есть: `buildEndpointRequest` (endpoint → `groupInputsByLocation` → абсолютный URL + `RequestInit`, SSRF внутри `resolveStepUrl`), `executePeriodicStep` — образец опроса с прогрессом, `requestUserInput` — паузный механизм `waiting_input` (worker отпускает SQS-слот, submit страницы досылает сообщение-продолжение).
3. **`MinioService`** умеет только писать (`putObject`, multipart) и выдавать presigned URL — читать объект нечем.

Тип `FileStep` уже описан: `appId?`, `uploadMethod?`, `uploadPath?`, `fileMode?`, `contentType?`, `statusEndpoint? {method, path, intervalSec, progressField}`. У `PageBlock` (dropzone) настроек формата/размера нет.

## Goals / Non-Goals

**Goals:**

- Файл из dropzone реально доезжает до API провайдера, шаг возвращает его ответ как результат.
- Single/chunked выбирается автоматически по порогу из публичного runtime-конфига; chunked — с прогрессом, паузой/возобновлением, отменой и восстановлением после обрыва.
- Валидация формата и размера файла из настроек dropzone-блока — до начала загрузки.
- Стадия обработки: опрос `statusEndpoint` с публикацией `progress`-событий, как у periodic-шага.
- Переиспользование существующего: uploads API, `buildEndpointRequest`, паузный механизм страниц, WS-события.

**Non-Goals:**

- Прямая загрузка браузер → провайдер (минуя наш бэкенд) — не делаем: SSRF-политика и приватные токены провайдера живут на сервере.
- Несколько файлов в одном dropzone / несколько dropzone на страницу шага — модель не запрещает, но UI и worker обрабатывают по одному файлу на блок; мультивыбор вне скоупа.
- Ретеншн/GC объектов в MinIO (TTL, удаление после запуска) — отдельная задача.
- Конфигуратор файлового шага в билдере — **отсутствует** (обнаружено на живом прогоне: `StepPicker` создаёт `{type: "file"}` без `appId`/`uploadPath`/`statusEndpoint`); его добавление — отдельный change. Здесь трогаем только инспектор dropzone-блока.

## Decisions

### 1. Маршрут файла: браузер → наш бэкенд (MinIO) → worker → провайдер

Браузер грузит файл существующими `/api/uploads/*` (наша авторизация, наш лимит), worker скачивает объект из MinIO и сам вызывает провайдера. Альтернатива — браузер грузит напрямую провайдеру — отвергнута: вызов провайдера обязан проходить `ssrfGuard.assertSafeUrl` и может требовать заголовков/токенов из маппингов шага, которые клиенту не показываются; к тому же chunked-протокол провайдера нам неизвестен, а свой (MinIO multipart) уже реализован и переживает обрыв. Worker и main — один процесс, MinIO доступен обоим.

### 2. Файл загружается ДО сабмита страницы; в `page:submit` едет ссылка на объект

Кнопка сабмита блокируется, пока загрузка обязательного dropzone не завершена (это уже так: `values[block.id]` пуст → `canSubmit` false). `onFile` запускает загрузку сразу после выбора файла; по завершении `values[block.id] = {objectName, fileName, fileSize, fileType}`. Дальше работает существующий конвейер без изменений: `page:submit` → `POST /api/runs/:id/page-submit` → `pendingInput` → сообщение-продолжение → `mapPageDataToLocalKeys` кладёт ссылку под `binding` блока (или его `id`) в `ctx.userInput`. Альтернатива «грузить после сабмита» ломала бы паузный механизм (потребовался бы второй раунд ожидания) и лишала пользователя прогресса/ретраев до отправки шага.

### 3. Привязка: worker ищет во входах шага «файловую ссылку» по форме значения

`executeFileStep` берёт из `ctx.userInput` значение, которое выглядит как файловая ссылка (`{objectName, fileName, ...}` — type guard в shared-типах: `UploadedFileRef`). Если файловых ссылок несколько — берётся привязанная к `binding`, совпадающему с body-входом endpoint'а бинарного формата, иначе первая; если ни одной — доменная ошибка «файл не был загружен». Имя multipart-поля, по приоритету: body-вход схемы endpoint'а типа `file` → привязка dropzone-блока, если совпадает с body-входом (спеки, импортированные до маппинга `format: binary` → `file` в парсере, хранят файловое поле строкой — случай llm-doc-recognizer) → единственный незанятый body-вход → `"file"`. Это не требует новых полей в `FileStep` и работает для легаси-шагов без схемы. Парсер OpenAPI дополнительно маппит `type: string, format: binary|base64` в `SchemaField.type: "file"` для новых импортов.

### 4. Запрос к провайдеру: `buildEndpointRequest` + замена тела на `FormData`

Сборка вызова идёт существующим `buildEndpointRequest(step, uploadMethod, uploadPath, resolved, ctx)` — он даёт абсолютный URL (SSRF внутри) и раскладку входов по path/query/header/body. Поверх него `executeFileStep` собирает `FormData`: файл (Buffer из MinIO → `Blob` с `contentType` и `fileName`) в multipart-поле из решения 3, остальные body-входы — обычными текстовыми полями рядом. Заголовок `Content-Type: application/json` из `buildEndpointRequest` удаляется — boundary выставит `fetch` сам. Node 18+ `FormData`/`Blob` — без новых зависимостей. Файл читается в память целиком: порог single — 10 МБ, chunked-файлы крупнее, но и они собираются в один объект MinIO; стриминг multipart — усложнение без текущей надобности (лимиты правит `file-size-limits`).

### 5. Обработка: опрос `statusEndpoint` по образцу `executePeriodicStep`

Если `statusEndpoint` задан — после успешной загрузки worker опрашивает `method`+`path` (тем же `buildEndpointRequest`; во входы опроса добавляются выходы ответа загрузки, чтобы `{id}` из ответа провайдера подставлялся в путь статуса) с интервалом `intervalSec`, публикует `progress` (поле `progressField`) и завершает по `isPollComplete` либо таймауту `POLL_TIMEOUT_MS` — вся логика повторяет periodic-шаг; выносится в общий приватный хелпер, чтобы не дублировать цикл. Результат шага — последний ответ опроса; без `statusEndpoint` — ответ загрузки.

### 6. Валидация файла: настройки dropzone-блока + публичный порог

`PageBlock` получает опциональные поля `accept?: string[]` (расширения/MIME) и `maxFileMb?: number`; инспектор конструктора страниц показывает их только для dropzone. PageRunner проверяет файл при выборе: формат и размер из блока, порог single/chunked — из `runtimeConfig.public.fileSingleUploadMaxMb` (уже опубликован change'ом `centralize-file-size-limits`). Серверная проверка формата остаётся в `UploadsService` (`ALLOWED_CONTENT_TYPES`, лимит single) — клиентская валидация её дублирует, но не заменяет.

### 7. Фронтенд-загрузчик: composable `useFileUpload` на XHR/fetch с состоянием

Логика single/chunked, прогресс (byte-level: для single — `XMLHttpRequest.upload.onprogress`, для chunked — по завершённым частям + прогресс текущей), пауза (перестаём слать следующий чанк), возобновление (в т.ч. после обрыва: `GET /api/uploads/chunked/:id` → продолжаем с первой недостающей части), отмена (`abort`) — в отдельном composable, чтобы PageRunner остался тонким. Размер чанка — `DEFAULT_UPLOAD_PART_SIZE_MB` (5–10 МБ), значение дублируется в публичный runtime-конфиг. `uploadId` активной сессии держится в состоянии композабла — обрыв сети не теряет его, пока открыта страница.

### 8. Чтение из MinIO: `MinioService.getObjectBuffer(objectName)`

Новый метод на `client.getObject` (stream → Buffer). Присайн-URL для скачивания worker'ом не используем — лишний HTTP-хоп и зависимость от `S3_URL`, видимого из процесса, тогда как SDK-клиент уже сконфигурирован.

## Risks / Trade-offs

- **[Файл целиком в памяти worker'а при отправке провайдеру]** → приемлемо для текущих лимитов; если появятся файлы в сотни МБ — отдельная задача на стриминг multipart (см. Non-Goals, `file-size-limits` управляет порогами.
- **[`values` с объектом-ссылкой уходит и в шаги без типа `file`]** → `mapPageDataToLocalKeys` не меняется; не-файловые шаги получат объект в маппинге, как раньше получали метаданные. Type guard `UploadedFileRef` даёт стабильное распознавание.
- **[Обрыв на single-загрузке не возобновляем]** → по спеке resume обязателен только для chunked; single ≤ 10 МБ просто перезапускается с нуля (кнопка «Повторить»).
- **[Рестарт `nest --watch` во время `waiting_input`]** → уже решено паузным механизмом: ожидание не держит консьюмера, продолжение приходит отдельным SQS-сообщением; загрузка файла происходит, пока run стоит в `waiting_input`, и рестарта не боится.
- **[Ответ загрузки провайдера не JSON]** → как в api-шаге: по `content-type` парсим JSON либо возвращаем текст; входы опроса статуса тогда берутся только из маппингов шага.
- **[Presigned URL в результате шага утекает в stepResults]** → в результат шага кладём ответ провайдера, а не наши внутренние `{objectName, url}`; ссылка на объект остаётся только во входах.

## Migration Plan

Деплой обычный: изменения аддитивны (новые поля `PageBlock` опциональны, `executeFileStep` заменяет заглушку). Старые сценарии с файловым шагом и так не работали (placeholder); старые страницы без настроек формата/размера валидируют только по серверному `ALLOWED_CONTENT_TYPES`. Откат — revert, данные не мигрируются.

## Open Questions

- Нужно ли отдавать провайдеру оригинальное имя файла в `Content-Disposition` всегда, или брать имя из настроек шага? Пока — всегда оригинальное (`fileName` из ссылки).
- `fileMode` в `FileStep` фактически не нужен (режим определяется размером на клиенте) — оставляем поле как есть, в UI не выводим; удаление — при следующей ревизии типов.
