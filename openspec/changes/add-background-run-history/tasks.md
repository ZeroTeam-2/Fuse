## 1. Shared: типы и события

- [ ] 1.1 В `packages/shared/src/types/index.ts` добавить `RunFileRef` (алиас/расширение `UploadedFileRef`), `RunListItem` (id, scenarioId, scenarioTitle, status, createdAt, updatedAt, currentStep, totalSteps, error?), типы уведомлений (`Notification`, `NotificationType`: run_completed | run_failed | run_cancelled | run_waiting_input)
- [ ] 1.2 В `packages/shared/src/events/index.ts` добавить события namespace уведомлений: `notification:new`, снапшот `notifications:snapshot` (`{ unreadCount }`)

## 2. Backend: реестр файлов и файловые ответы API (run-artifacts)

- [ ] 2.1 В `run.schema.ts` добавить поле `files: RunFileRef[]` (default `[]`) и индекс `{ userId: 1, createdAt: -1 }`
- [ ] 2.2 В `worker.service.ts` в `executeApiStep` (и финальном ответе `pollUntilComplete`) реализовать детект файлового ответа по `Content-Type`/`Content-Disposition`: json → JSON, text/* → строка, иначе → `arrayBuffer` → `minio.uploadFile('runs/{userId}/{runId}/{stepIndex}-{uuid}{ext}')`, результат шага = `RunFileRef`; лимит `RUN_ARTIFACT_MAX_BYTES` (превышение = StepExecutionError)
- [ ] 2.3 Атомарно регистрировать артефакт в `run.files` (`$push`) вместе с записью результата шага (upload в S3 — до записи в Mongo)
- [ ] 2.4 Регистрировать в `run.files` пользовательские `UploadedFileRef` из `createRun(inputs)`, `submitInputs` и `submitPageData` (обход значений с `isUploadedFileRef`)
- [ ] 2.5 Endpoint `GET /api/runs/:id/file-link?objectName=...`: владелец запуска + objectName ∈ `run.files` → `getPresignedUrl`; иначе 403/404

## 3. Backend: список и удаление запусков (run-history)

- [ ] 3.1 `GET /api/runs` в `execution.controller.ts`/`execution.service.ts`: фильтр `userId` из JWT, опциональный `status` (список через запятую), пагинация `PaginatedResponse<RunListItem>`, сортировка `createdAt: -1`, `.select()` без тяжёлых полей, батч-подгрузка названий сценариев («Сценарий удалён» при отсутствии)
- [ ] 3.2 `DELETE /api/runs/:id`: владелец, только терминальный статус (иначе 409 с подсказкой отменить), каскад — S3-файлы из `files[]` (ошибки логировать, не прерывать) → уведомления запуска → документ `Run`
- [ ] 3.3 Добавить проверку владельца в `cancelRun`, `submitPageData`, `submitInputs` (по образцу `getRun`)
- [ ] 3.4 Отдавать `inputs` запуска в `GET /api/runs/:id` (нужно фронту для «Повторить запуск»)

## 4. Backend: уведомления (run-notifications)

- [ ] 4.1 Модуль `notifications/`: схема `Notification` (userId, runId, scenarioId, scenarioTitle, type, read, timestamps; индексы `{userId, createdAt:-1}`, `{userId, read}`, уникальный `{runId, type}`), сервис с `notify(...)` (игнор duplicate-key)
- [ ] 4.2 REST: `GET /api/notifications` (пагинация), `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` — всё только для текущего пользователя
- [ ] 4.3 Gateway namespace `notifications`: JWT из куки handshake, комната `user:{userId}`, снапшот `{ unreadCount }` при подключении, эмит `notification:new` из сервиса
- [ ] 4.4 Вызвать `notify(...)` из воркера при переходах в `completed`/`failed`/`cancelled`/`waiting_input` (в `completeRun`/`failRun`/обработке отмены/паузы)

## 5. Backend: проверка и типы

- [ ] 5.1 Прогнать backend-тесты/линт; проверить Swagger-аннотации новых endpoint'ов
- [ ] 5.2 Регенерировать типы фронта `pnpm gen:types` (нужен поднятый бэк; НЕ убивать живой dev-процесс пользователя — согласовать)

## 6. Frontend: колокольчик уведомлений

- [ ] 6.1 Pinia-стор + composable `useNotificationsSocket` (подключение к namespace `notifications`, снапшот, `notification:new`, REST-фолбэк при загрузке)
- [ ] 6.2 Компонент `NotificationsBell.vue` в `layouts/default.vue` (только авторизованным) — Vue-порт `NotificationBell` из эталона `assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx`: кнопка с бейджем непрочитанных, панель 360px (плитка статуса, «название — событие», относительное время, точка непрочитанности), футер «Все запуски →»; открытие панели → `read-all`; клик по уведомлению → `/cards/{scenarioId}/run?run={runId}`

## 7. Frontend: раздел «Запуски» (порт эталона Runs.jsx → Vue)

- [ ] 7.1 Страница `pages/my/runs/index.vue` по эталону: заголовок с подводкой, вкладки «Активные · N» / «Завершённые · N» (`Tabs` → фильтр `status`), пагинация, пустые состояния обеих вкладок из эталона
- [ ] 7.2 Компонент строки-аккордеона `RunRow` (+`StatusTile`): свёрнуто — плитка статуса, название, id, время/живой таймер и чип «шаг X из N» для running, бейдж статуса (маппинг: pending→«В очереди», waiting_input→«Ждёт ввода»); развёрнуто — `SegmentedControl` с панелями Прогресс (`StepProgress`) / Результат (`KeyValueGrid`) или блок ошибки/отмены / Входные файлы / Результаты (карточки файлов со «Скачать»)
- [ ] 7.3 Панель действий: «Отменить запуск» (активный), «Открыть результат»/«Продолжить» (→ `/cards/{scenarioId}/run?run={id}`), «Повторить запуск» (терминальный: `POST /api/runs` с `scenarioId`+`inputs` исходного), «Удалить из истории» (терминальный, Modal-подтверждение — сознательное отклонение от эталона, т.к. стираются файлы из S3)
- [ ] 7.4 Пункт «Запуски» в `navItems` (`layouts/default.vue`, private)
- [ ] 7.5 Актуализация статусов: refetch по `notification:new` и при возврате фокуса вкладки; обновление списка после удаления/повтора

## 8. Frontend: файловые результаты в RunPanel

- [ ] 8.1 В отображении результата шага/итога распознавать `RunFileRef` (`isUploadedFileRef`) и рендерить карточку файла (имя, размер, тип) вместо JSON
- [ ] 8.2 Кнопка «Скачать»: запрос `GET /api/runs/:id/file-link` → открыть presigned URL

## 9. Верификация

- [ ] 9.1 Юнит-тесты: детект файлового ответа, каскад удаления, идемпотентность уведомлений (уникальный индекс), проверка владельца в list/delete/file-link
- [ ] 9.2 E2E вручную по сиду: запуск сценария с файловым ответом (mock-api) → уйти со страницы → колокольчик → раздел «Запуски» → открыть результат → скачать файл → удалить запуск → файлы удалены из MinIO
