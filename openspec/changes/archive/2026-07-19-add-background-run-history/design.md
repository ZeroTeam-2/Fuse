# Design: add-background-run-history

## Context

Исполнение уже фоновое: `POST /api/runs` создаёт `Run` (Mongo) и кладёт `{ runId }` в SQS; `WorkerService` (тот же процесс NestJS) исполняет шаги и публикует прогресс через socket.io namespace `runs` (комнаты `run:{runId}`, снапшот `run:status` при подключении). Файлы пользователей живут в MinIO/S3 (`MinioService`: `uploadFile`, `getObjectBuffer`, `getPresignedUrl` (TTL 24ч), `deleteFile`; ключи `uploads/{userId}/{uuid}{ext}`).

Пробелы: нет `GET /api/runs` (список) и `DELETE /api/runs/:id`; файловый ответ внешнего API портится через `response.text()` и оседает строкой в Mongo; уведомлений (модели, gateway, колокольчика) нет вовсе; у `runs` нет индекса под листинг.

Ключевые файлы: `apps/backend/src/execution/{run.schema,execution.controller,execution.service,worker.service}.ts`, `apps/backend/src/minio/minio.service.ts`, `apps/backend/src/websocket/run.gateway.ts`, `packages/shared/src/{types,enums,events}/index.ts`, `apps/frontend/{layouts/default.vue,components/RunPanel.vue,composables/useRunSocket.ts,pages/my/scenarios/index.vue}`.

Дизайн-эталон UI готов: `assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx` — экран «Запуски» (вкладки, строки-аккордеоны, панели, действия, пустые состояния) и компонент `NotificationBell` (колокольчик с панелью); скетчи — `assets/Fuse Design System/scraps/*-runs.png`. Vue-порт компонентов DS уже выполнен ранее (`components/ui/*` во фронтенде).

## Goals / Non-Goals

**Goals:**
- Раздел «Запуски»: пагинированный список активных/завершённых запусков пользователя, переход к существующему экрану запуска (`?run=<id>` уже восстанавливает состояние).
- `DELETE /api/runs/:id` с каскадом: файлы S3 (по реестру файлов запуска) → уведомления → документ `Run`.
- Файловые ответы API → S3 (`runs/{userId}/{runId}/...`), в результате шага — `RunFileRef`, скачивание по presigned URL через новый endpoint с проверкой владельца.
- Уведомления: Mongo-модель, REST (список/счётчик/прочитано), socket.io-доставка в комнату `user:{userId}`, колокольчик в шапке.

**Non-Goals:**
- Ретеншн/автоочистка старых запусков, квоты на объём файлов.
- Email/push-каналы уведомлений; настройки подписок.
- Изменение механики исполнения шагов, отмены, page/input-submit (кроме записи файловых ответов).
- Миграция старых запусков (их файловые ответы уже испорчены строкой — оставляем как есть).

## Decisions

### D1. Реестр файлов — поле `files: RunFileRef[]` в документе `Run`
Каскадное удаление требует знать все objectName запуска: и артефакты воркера, и `UploadedFileRef`, пришедшие через inputs/page-submit. Вместо сканирования `stepResults`/`inputs`/`pageData` эвристиками — явный реестр, пополняемый в двух местах: (1) воркер при выгрузке артефакта, (2) `submitPageData`/`submitInputs`/`createRun` при обнаружении `isUploadedFileRef` во входных значениях. Альтернатива «префикс-листинг S3 `runs/{userId}/{runId}/`» не покрывает пользовательские загрузки (`uploads/{userId}/...`, ключ не содержит runId) — отвергнута как единственный механизм, но листинг префикса можно использовать как дополнительную страховку при удалении.

### D2. Детект файлового ответа — по заголовкам, сохранение через существующий `MinioService`
В `executeApiStep` (и в финальном ответе `pollUntilComplete`) вместо `json()/text()`: если `content-type` содержит `application/json` → JSON; `text/*` → строка; иначе, либо есть `Content-Disposition: attachment` → `response.arrayBuffer()` → `minio.uploadFile('runs/{userId}/{runId}/{stepIndex}-{uuid}{ext}', buffer, contentType)`. Имя файла — из `Content-Disposition` (filename), иначе генерируется из шага + расширения по MIME. Лимит размера — env (`RUN_ARTIFACT_MAX_BYTES`, дефолт как у uploads); превышение = `StepExecutionError` (доменная ошибка, без ретрая). Тип результата шага — `RunFileRef = UploadedFileRef` (переиспользуем shared-тип и type-guard `isUploadedFileRef`; фронт уже умеет его различать).

### D3. Скачивание — `GET /api/runs/:id/files/:objectName(*)/link` → presigned URL
Прямой presigned на 24ч в `stepResults` не кладём (протухнет и утечёт при шаринге JSON): endpoint валидирует владельца запуска и членство objectName в `run.files`, затем `getPresignedUrl`. Фронт (`RunPanel.vue` + отображение результата) рендерит `RunFileRef` карточкой файла с кнопкой «Скачать», по клику запрашивает ссылку и открывает её. objectName содержит `/` — передаётся как query-параметр (`?objectName=`), не как path-сегмент.

### D4. Список — `GET /api/runs` в `ExecutionService`, проекция без тяжёлых полей
`find({ userId, status? })` с `.select()` без `stepResults.result`/`inputs`/`pendingInput` (результаты бывают большими), `sort({ createdAt: -1 })`, skip/limit → `PaginatedResponse<RunListItem>`. Название сценария денормализуем на лету батч-запросом по `scenarioId` (запусков на странице ≤ 20; вариант «хранить scenarioTitle в Run» отвергнут — дублирование и рассинхрон при переименовании). Индекс `{ userId: 1, createdAt: -1 }` в `run.schema.ts`. Заодно закрываем дыру: `cancelRun`/`submitPageData`/`submitInputs` получают проверку владельца (как `getRun`).

### D5. Удаление — только терминальные статусы, идемпотентный каскад
`DELETE /api/runs/:id`: владелец + терминальный статус (иначе 409 с подсказкой отменить). Порядок: `deleteFile` по каждому `files[]` (ошибки логируются, не прерывают), `notificationModel.deleteMany({ runId })`, `runModel.deleteOne`. Так недоудалённый каскад можно повторить (документ ещё жив, реестр цел).

### D6. Уведомления — отдельный модуль `notifications/` + namespace `notifications`
- Схема `Notification`: `userId`, `runId`, `scenarioId`, `scenarioTitle`, `type` (`run_completed` | `run_failed` | `run_cancelled` | `run_waiting_input`), `read: boolean`, timestamps; индексы `{ userId, createdAt: -1 }` и `{ userId, read }`. Уникальный индекс `{ runId, type }` — идемпотентность при повторной доставке SQS-сообщения (create с игнором duplicate key).
- `NotificationsService.notify(...)` вызывается воркером в `completeRun`/`failRun`/отмене и при переходе в `waiting_input`. Воркер и API в одном процессе — вызов в память, брокер не нужен (как с `RunGateway`).
- REST: `GET /api/notifications` (пагинация), `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` — всё под JWT, фильтр `userId`.
- Gateway: namespace `notifications`, авторизация по JWT из куки handshake (в отличие от `RunGateway`, где комната по runId — здесь нельзя доверять query-параметру userId), комната `user:{userId}`, при подключении — снапшот `{ unreadCount }`, событие `notification:new`. Фронт: composable `useNotificationsSocket` + Pinia-стор, компонент `NotificationsBell.vue` в `layouts/default.vue` рядом с меню профиля; фолбэк — REST при загрузке.

### D7. UI по эталону дизайн-системы: `Runs.jsx` → Vue
Готовый дизайн лежит в `assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx` (плюс скетчи `scraps/*-runs.png`); портируем JSX → Vue по сложившейся практике DS-порта, используя существующие Vue-компоненты UI-кита (`Tabs`, `SegmentedControl`, `Badge`, `Card`, `Button`, `Icon`, `StepProgress`, `KeyValueGrid`, `Pagination`, `Modal`).

Страница `pages/my/runs/index.vue`:
- Заголовок + вкладки «Активные · N» / «Завершённые · N» (`Tabs`); вкладка мапится на фильтр `status` в `GET /api/runs`; счётчики — из total обеих выборок.
- Строка-аккордеон (`RunRow`): свёрнуто — плитка статуса (`StatusTile`, спиннер для running), название сценария, id, время/живой таймер, чип «шаг X из N» для running, бейдж статуса; развёрнуто — `SegmentedControl` с панелями Прогресс (`StepProgress`) / Результат (`KeyValueGrid`) или блок ошибки/отмены / Входные файлы / Результаты (карточки файлов с «Скачать» через file-link endpoint).
- Действия: «Отменить запуск» (активный, `POST /api/runs/:id/cancel`), «Открыть результат» (→ `/cards/{scenarioId}/run?run={id}`), «Повторить запуск» (терминальный: `POST /api/runs` с `scenarioId` + `inputs` исходного запуска — их отдаёт `GET /api/runs/:id`), «Удалить из истории» (терминальный).
- Пустые состояния обеих вкладок — тексты и вёрстка из эталона.

Маппинг статусов эталона на реальные: `queued`→`pending`, `running`→`running`, `done`→`completed`, `error`→`failed`, `cancelled`→`cancelled`; `waiting_input` (в эталоне отсутствует) — активный, со своим бейджем «Ждёт ввода» (тон brand) и действием «Продолжить» → экран запуска.

Сознательное отклонение от эталона: «Удалить из истории» — через Modal-подтверждение (эталон удаляет мгновенно, но у нас удаление безвозвратно стирает файлы из S3).

Актуализация активных: подписка на `notification:new` (терминал/ожидание ввода → refetch списка) + refetch при возврате фокуса вкладки; отдельный WS-канал прогресса списка не строим (детальный прогресс — на экране запуска).

Колокольчик — по `NotificationBell` из того же файла: кнопка 38px в шапке (`layouts/default.vue`, слева от меню профиля), бейдж непрочитанных, панель 360px с лентой (плитка статуса, «название — событие», относительное время, точка непрочитанности), футер «Все запуски →». Открытие панели помечает уведомления прочитанными (эталонное поведение; REST `read-all` с небольшой задержкой), данные ленты — из модели `Notification`, а не из списка запусков.

## Risks / Trade-offs

- [Буферизация файла в памяти воркера (`arrayBuffer`)] → лимит `RUN_ARTIFACT_MAX_BYTES`; стриминг в S3 — возможное будущее улучшение, для текущих объёмов достаточно буфера (uploads уже работают через Buffer).
- [Реестр `files[]` может разойтись с S3 при падении воркера между uploadFile и записью в Mongo] → сначала запись объекта в S3, затем атомарный `$push` в `files` вместе с записью результата шага; осиротевший объект без записи — приемлемая утечка, чистится вручную/будущим ретеншном.
- [Двойное уведомление при гонке повторной доставки] → уникальный индекс `{ runId, type }` на уровне Mongo, а не проверка в коде.
- [`waiting_input`-уведомление может прийти, когда пользователь и так на странице] → допустимо для v1; колокольчик — пассивный канал, шум минимальный.
- [Название сценария в списке/уведомлении после удаления сценария] → в уведомлении title денормализован при создании; в списке запусков при отсутствии сценария показываем «Сценарий удалён» (левым join'ом).
- [Регенерация `src/types/api.ts` (`pnpm gen:types`) требует поднятого бэка со Swagger] → выполняется в конце backend-этапа; фронтовые задачи зависят от неё.
- [`pnpm install` ломает живой nuxt dev у пользователя] → новых зависимостей дизайн не требует (socket.io, minio, mongoose уже в проекте); если всё же понадобится — предупредить пользователя, он перезапустит dev сам.

## Migration Plan

1. Backend: схема (`files`, индексы) → воркер (файловые ответы) → endpoints (list/delete/file-link) → модуль notifications. Изменения обратно совместимы: старые `Run` без `files` трактуются как пустой реестр.
2. Shared-типы и события → регенерация api-типов фронта.
3. Frontend: колокольчик, раздел «Запуски», файловые карточки в `RunPanel`.
4. Rollback: фичи аддитивны — откат кода не требует миграции данных; созданные артефакты в S3 остаются под префиксом `runs/` и удаляются вместе с запусками.

## Open Questions

- Нужен ли лимит хранения истории (например, авто-удаление запусков старше N дней)? Пока вне скоупа — реестр `files[]` делает будущий ретеншн тривиальным.
- Показывать ли в колокольчике прогресс активных запусков (не только терминальные события)? В v1 — нет, только завершение и ожидание ввода.
