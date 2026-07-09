# Revise Platform Architecture — Tasks (Milestones)

> Принцип: каждый milestone завершается тестами (unit/integration, а где задействован UI — e2e). Тесты — часть Definition of Done, а не финальная фаза.

## 1. Milestone 0 — Инфраструктура и тестовый фундамент

- [ ] 1.1 Настроить Vitest (unit) в `apps/backend`, `apps/frontend`, `packages/shared`; конфиги, скрипты `test`/`test:ci`;coverage-порог
- [ ] 1.2 Настроить интеграционное тестирование: `@nestjs/testing` + in-memory/тестовая Mongo (replica-set), helpers (app boot, cleanup)
- [ ] 1.3 Настроить Playwright (e2e) в `apps/frontend`/корне: базовый конфиг, скрипты, dev-server fixture
- [ ] 1.4 docker-compose: перевести локальную Mongo на replica-set (`--replSet`); добавить MinIO (Object Storage) и опц. ElasticMQ (локальный SQS-совместимый стенд для YMQ)
- [ ] 1.5 Добавить зависимости бэкенда: `@nestjs/websockets`, `@nestjs/platform-ws`, `ws`, `@aws-sdk/client-sqs`, `@aws-sdk/client-cloudwatch` (опц.), OAuth-клиент Yandex (`passport-yandex-oauth2` или ручной клиент), `pino`
- [ ] 1.6 Определить shared-типы в `packages/shared`: enum `RunStatus` (`queued|running|waiting_input|done|error|cancelled`), форматы WS-событий запуска, конфиг-схема наблюдаемости
- [ ] 1.7 CI: шаги lint (oxlint), typecheck, unit + integration тестов на PR; артефакт coverage
- [ ] 1.8 Тесты M0: smoke unit-тесты на конфиг/env-валидацию; e2e-заглушка «открывается главная»

## 2. Milestone 1 — Аутентификация Yandex ID (`auth-profile`)

- [ ] 2.1 Backend: OAuth-модуль — `/auth/yandex` (redirect), `/auth/yandex/callback` (обмен кода → профиль Yandex), апсерт `User` (имя/email/аватар из Yandex), JWT access+refresh в httpOnly cookie
- [ ] 2.2 Backend: `JwtAuthGuard`; публичен только каталог; убрать поля/роуты email+password и смену пароля из модулей users/auth
- [ ] 2.3 Backend: профиль пользователя — геттер и обновление (ФИО, аватар: загрузка/удаление → инициалы), данные при первом входе сеются из Yandex
- [ ] 2.4 Frontend: кнопка «Войти через Yandex», обработка callback, хранение сессии, guard защищённых роутов
- [ ] 2.5 Frontend: страница профиля (данные, аватар) — на основе данных из Yandex
- [ ] 2.6 Тесты unit: маппинг профиля Yandex → User, выпуск/проверка JWT, guard (публичный vs защищённый)
- [ ] 2.7 Тесты integration: флоу входа (замоканный Yandex OAuth), апсерт пользователя, обновление профиля
- [ ] 2.8 Тесты e2e: вход через Yandex (замоканный провайдер) → открытие маркетплейса с данными пользователя

## 3. Milestone 2 — Очередь выполнения и воркеры (`queue-execution`)

- [ ] 3.1 Backend: интерфейсы `QueueClient` (sendMessage/receiveMessage/deleteMessage/changeVisibility) и реализация поверх `@aws-sdk/client-sqs` → Yandex Message Queue; конфиг эндпоинта/ключей
- [ ] 3.2 Backend: модель `Run` + `RunStore` — пошаговое состояние (`steps[]`: status/inputs/outputs/timings/error), журнал событий с монотонным `eventId`, агрегированный статус
- [ ] 3.3 Backend: main-process — валидация запроса запуска, создание `Run` (status=`queued`), постановка задачи в очередь `fuse-runs`
- [ ] 3.4 Backend: воркер-entrypoint (отдельный процесс) — long-poll очереди, загрузка `Run`/`Scenario`, исполнение с резолва `resumeFromStep`, персист после каждого шага, `deleteMessage` по завершении
- [ ] 3.5 Backend: переходы статусов (`queued→running→(waiting_input→running)*→done|error|cancelled`), отмена (`cancelled`) по флагу перед каждым шагом
- [ ] 3.6 Backend: резюме — при истечении visibility timeout задача возвращается, воркер продолжает с последнего незавершённого шага; resume-сообщение при `waiting_input` после ввода пользователя (POST API → enqueue)
- [ ] 3.7 Backend: ретраи — `maxReceiveCount` → dead-letter queue → `Run.status=error`; продление visibility timeout (`ChangeMessageVisibility`) для длительных Periodic-шагов
- [ ] 3.8 Backend: движок шагов в воркере (резолв маппингов, `{{token}}`-подстановка, HTTP-вызовы с SSRF-защитой и таймаутами, delay/periodic/вложенный сценарий, stop-on-error)
- [ ] 3.9 Тесты unit: переходы статусов, точка резюма (`resumeFromStep`), детектор идемпотентности/`attempt`, подстановка токенов
- [ ] 3.10 Тесты integration: full-cycle `enqueue → worker → Run` на моке `QueueClient` + тестовой Mongo (успех, ошибка шага, resume после «падения», DLQ по исчерпанию попыток)
- [ ] 3.11 Тесты e2e: запуск сценария (замоканная YMQ) проходит статусы queued→running→done; сценарий с ошибкой → error с диагностикой

## 4. Milestone 3 — WebSocket-стриминг выполнения (`scenario-execution` realtime)

- [ ] 4.1 Backend: WS-gateway (`@nestjs/websockets`) — подключение, подписка/комната по `runId`, отправка событий клиенту
- [ ] 4.2 Backend: ретрансляция `Run` → WS через MongoDB Change Streams (replica-set); fallback на короткий polling по `lastEventId` при отсутствии change streams
- [ ] 4.3 Backend: реконнект-безопасность — клиент шлёт `lastEventId`, сервер досылает только пропущенные события (журнал версионирован)
- [ ] 4.4 Frontend: WS-клиент хода запуска (вместо EventSource) — подписка по `runId`, рендер статусов и событий шагов, авто-переподключение с `lastEventId`
- [ ] 4.5 Frontend: интеграция потока с UI запуска (прогресс шагов, `page:required` → форма, финальная сводка)
- [ ] 4.6 Тесты unit: форматирование событий, вычисление «пропущенных» событий по `lastEventId`, комнаты подписки
- [ ] 4.7 Тесты integration: доставка событий через change streams (тестовая replica-set Mongo) и через polling-fallback; реконнект без дублей
- [ ] 4.8 Тесты e2e: запуск сценария в UI, обрыв WS-соединения → переподключение, прогресс продолжает корректно (без потерь/дублей)

## 5. Milestone 4 — Загрузка файлов с порогом 25 МБ (`scenario-execution` files)

- [ ] 5.1 Backend: порог `UPLOAD_SINGLE_MAX_MB=25` (конфиг); эндпоинт разовой загрузки ≤25 МБ (multipart) → Object Storage/провайдеру
- [ ] 5.2 Backend: принудительная чанковая загрузка >25 МБ (init/part/complete/abort), состояние частей в Mongo, валидация формата и лимита из страницы шага
- [ ] 5.3 Backend: в воркере — передача файла в endpoint провайдера (multipart целиком / чанки octet-stream), стадия обработки через опрос статуса
- [ ] 5.4 Frontend: определение режима по размеру до старта; дропзона с прогрессом, пауза/продолжение/отмена; «Возобновить загрузку» после обрыва
- [ ] 5.5 Frontend: экран результата файлового шага (поля/текст, «Загрузить другой файл»)
- [ ] 5.6 Тесты unit: определение режима по порогу, валидация лимитов/форматов, логика состояния частей
- [ ] 5.7 Тесты integration: разовая загрузка < порога и чанковая > порога (MinIO); pause/resume/abort; передача в провайдера
- [ ] 5.8 Тесты e2e: загрузка небольшого и большого файла в UI сценария, возобновление после обрыва

## 6. Milestone 5 — Наблюдаемость (опционально: Metrica + monium)

- [ ] 6.1 Frontend: инициализация Yandex Metrica при `NUXT_PUBLIC_YANDEX_METRIKA_ID`; продуктовые события (запуск, успех/ошибка, публикация)
- [ ] 6.2 Backend: structured-логирование (`pino`); emitter метрик за интерфейсом (`MetricsEmitter`); реализация для Yandex Cloud Monitoring (monium) через `@aws-sdk/client-cloudwatch` при `YC_*`; иначе вывод в stdout
- [ ] 6.3 Backend: ключевые метрики — длина очереди, время шага, запуски по статусам, частота ошибок; подключение interceptor/module без затекания в доменную логику
- [ ] 6.4 Тесты unit: условное включение по конфигу (вкл/выкл), форматирование метрик и событий Metrica
- [ ] 6.5 Тесты integration: при отсутствии `YC_*`/Metrica-id внешних вызовов нет (assert no network); при наличии — отправка мокается и проверяется

## 7. Milestone 6 — Ревизия fuse-platform-mvp и стабилизация

- [ ] 7.1 Обновить delta-спеки `fuse-platform-mvp`: D1 (SSE→WebSocket+queue), D6 (email→Yandex); привести tasks milestones в соответствие (встроить тесты); разрешить конфликты в пользу этого change
- [ ] 7.2 Сквозной E2E: вход через Yandex → запуск сценария (очередь + WS + порог файла) → результат; проверка резюме после обрыва/сбоя воркера (Playwright)
- [ ] 7.3 Аудит безопасности: SSRF в воркере, шифрование секретов-констант at rest, лимиты/visibility timeout, rate limiting auth
- [ ] 7.4 Документация: README (архитектура queue/worker/WS, переменные окружения YMQ/OAuth/Metrica/monium), обновить `openspec/config.yaml` (context проекта)
- [ ] 7.5 Демо-данные/seed для сквозной проверки статусов и резюме
