# Fuse Platform MVP — Tasks (Milestones)

## 1. Milestone 0 — Фундамент монорепо

- [x] 1.1 Инициализировать `apps/backend`: NestJS + Mongoose, конфиг (env), health-check, `@nestjs/swagger` со схемой на `/api/schema.json`, WebSocket-шлюз (заготовка)
- [x] 1.2 Инициализировать `apps/frontend`: Nuxt 3 + Pinia, базовый layout (шапка: Маркетплейс / Мои сценарии / Мои API / профиль), API-клиент, WebSocket-клиент (composable)
- [x] 1.3 Наполнить `packages/shared`: типы домена (App, Endpoint, Scenario, Step-union, Page, Run, RunStatus-enum), enum'ы типов шагов/страниц, справочник категорий с подкатегориями, типы событий очереди
- [x] 1.4 docker-compose: MongoDB + Redis + MinIO; pnpm dev-скрипты (main + worker), проверка `gen:types` end-to-end
- [x] 1.5 CI-заготовка: lint (oxlint), typecheck, unit-тесты на PR
- [x] 1.6 Тесты: unit (shared-типы, утилиты), integration (health-check, WebSocket-коннект)

## 2. Milestone 1 — Аутентификация через Yandex OAuth и профиль (`auth-profile`)

- [x] 2.1 Backend: модуль auth — Yandex OAuth flow (redirect на `oauth.yandex.ru/authorize`, callback, обмен code на token, запрос профиля `login.yandex.ru/info`), создание/обновление пользователя (email, ФИО, аватар из Яндекса)
- [x] 2.2 Backend: JWT access+refresh в httpOnly cookie, auth guard; настройки OAuth в env (`YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_REDIRECT_URI`)
- [x] 2.3 Backend: модуль users — профиль (ФИО, email), загрузка/удаление аватара (загрузка в MinIO)
- [x] 2.4 Frontend: страница входа с кнопкой «Войти через Яндекс», обработка OAuth-redirect, guard роутов
- [x] 2.5 Frontend: страница профиля — личные данные, аватар (из Яндекса при первом входе)
- [x] 2.6 Frontend: сводка «Мои API» и «Мои сценарии» в профиле (пагинация, статусы публикации)
- [x] 2.7 Тесты: unit (OAuth flow с mock Яндекса, JWT-генерация/валидация), integration (auth callback, session cookie, profile CRUD), e2e (вход через Яндекс → профиль → сводка)

## 3. Milestone 2 — Приложения и импорт OpenAPI (`api-app-management`)

- [x] 3.1 Backend: модель App + снимок спецификации; парсер OpenAPI (dereference, извлечение endpoints: метод/путь/summary, схемы in/out с примерами)
- [x] 3.2 Backend: импорт по URL с SSRF-защитой (https, запрет приватных IP, таймауты) и внятными ошибками валидации
- [x] 3.3 Backend: CRUD приложений, повторный импорт с diff (новые/deprecated endpoints), toggle публикации
- [x] 3.4 Frontend: список «Мои API» (пагинация) и карточка приложения (endpoints, синхронизация, счётчик сценариев)
- [x] 3.5 Frontend: мастер «Новое приложение» — форма, импорт, предпросмотр найденных endpoints, создание
- [x] 3.6 Frontend: экран «Обновление API» — reimport, diff с метками «НОВЫЙ», сохранение
- [x] 3.7 Тесты: unit (парсер на petstore + 2-3 публичных API, diff-логика, SSRF-guard), integration (CRUD, публикация), e2e (создание приложения → импорт → обновление)

## 4. Milestone 3 — Конструктор сценариев (`scenario-builder`)

- [x] 4.1 Backend: модели Scenario/Step (дискриминированный union), CRUD, валидация публикации (≥1 шаг), guard циклов вложенных сценариев
- [x] 4.2 Backend: выдача upstream-схем для маппинга (выходы шагов 0..i-1, входы endpoint'а с локациями path/query/header/body)
- [x] 4.3 Frontend: создание сценария — детали, обложка (drag-and-drop), rich-text описание (Tiptap: B/I/U, H1-H3, code), категория с поиском
- [x] 4.4 Frontend: редактор потока — список шагов, вставка в позицию, drag-and-drop порядок, редактирование/удаление, индикатор мультисервисности
- [x] 4.5 Frontend: пикер шага — тип «Endpoint API» (выбор приложения с поиском → endpoint), название шага
- [x] 4.6 Frontend: маппинг входов — источник (upstream/user/const) с автоподстановкой по ключу/метке, дефолтные заголовки (`Bearer {{access_token}}`), панель выходов с примерами
- [x] 4.7 Frontend: типы шагов «Задержка» (пресеты) и «Другой сценарий» (входы→выходы, без циклов)
- [x] 4.8 Frontend: тип шага «Файл» (авто-режим single/chunked по порогу 10 МБ, Content-Type, опрос статуса: endpoint, интервал, поле прогресса) и «Периодический запрос»
- [x] 4.9 Публикация/скрытие сценария; блокировка публикации без шагов с подсказкой
- [x] 4.10 Тесты: unit (валидация шагов, guard циклов DFS, маппинг-резолвер), integration (CRUD, публикация), e2e (создание сценария → добавление шагов → публикация)

## 5. Milestone 4 — Страницы шагов (`step-pages`)

- [x] 5.1 Shared/Backend: модель Page (fields/file/text) в составе Step, дефолтные шаблоны типов
- [x] 5.2 Frontend: редактор страницы — переключение типов с сохранением заголовка, поля (метка/placeholder/обязательное, добавление/удаление), тексты кнопок, форматы и лимит МБ (default 10 для single-upload), текстовое тело
- [x] 5.3 Frontend: live-превью «Как увидит пользователь»
- [x] 5.4 Frontend: бейдж страницы на шаге в редакторе потока, удаление страницы
- [x] 5.5 Тесты: unit (валидация модели Page), integration (сохранение в составе Scenario), e2e (создание страницы → превью → сохранение)

## 6. Milestone 5 — Маркетплейс (`marketplace`)

- [x] 6.1 Backend: каталог опубликованных карточек — фильтр категория/подкатегория, поиск (название+провайдер), сортировка популярные/новые, пагинация, агрегация счётчиков дерева
- [x] 6.2 Frontend: каталог — сетка карточек (обложка, tagline, провайдеры «+N», запуски), пагинация, сортировка, поиск с пустым состоянием
- [x] 6.3 Frontend: дерево категорий с счётчиками, раскрытие, хлебные крошки
- [x] 6.4 Frontend: страница карточки — вкладки «Обзор» (rich-описание, метрики), «Сервисы и endpoints»
- [x] 6.5 Landing-шапка маркетплейса (hero с счётчиком use-case)
- [x] 6.6 Тесты: unit (фильтрация, сортировка, поиск), integration (каталог API, пагинация), e2e (обзор маркетплейса → фильтр → карточка)

## 7. Milestone 6 — Исполнение сценариев: очереди, WebSocket, движок (`scenario-execution`)

- [x] 7.1 Backend: BullMQ + Redis, очередь выполнения сценариев; модель Run со статусами (`pending`, `running`, `waiting_input`, `completed`, `failed`, `cancelled`); main process создаёт Run + job
- [x] 7.2 Backend: worker process — исполнитель сценариев; последовательно исполняет шаги, после каждого шага сохраняет промежуточное состояние (результаты, тайминги) в Run; резолв маппингов и `{{token}}`-шаблонов; HTTP-вызовы endpoints с таймаутами и лимитами
- [x] 7.3 Backend: восстановление после падения worker'а — BullMQ перезапускает job, worker загружает промежуточное состояние из Run и продолжает с последнего шага
- [x] 7.4 Backend: WebSocket-gateway — real-time события через Redis pub/sub (`step:start`, `step:done`, `page:required`, `run:done`, `run:error`); клиент шлёт `page:submit`, `run:cancel`; reconnect по runId с загрузкой текущего статуса
- [x] 7.5 Backend: шаги delay (пауза), periodic (поллинг с прогрессом до завершения), вложенный сценарий; page:required → статус `waiting_input`
- [x] 7.6 Frontend: WebSocket-клиент — подключение по runId, обработка событий, индикатор прогресса, reconnect
- [x] 7.7 Frontend: простой режим — форма входов первого шага, прогресс шагов, итоговая сводка, «Запустить снова»
- [x] 7.8 Frontend: playground — пошаговый запуск, JSON-ответы с таймингами, «выполнить все», сброс, финальный статус
- [x] 7.9 Frontend: рендер страниц шагов в запуске (fields с required-валидацией, text), отправка данных через WebSocket
- [x] 7.10 Тесты: unit (резолвер маппингов, шаблоны, статусы Run), integration (очередь → worker → сохранение состояния → pub/sub → WebSocket-события, восстановление после падения), e2e (запуск сценария → прогресс → результат)

## 8. Milestone 7 — Файлы: single и chunked upload

- [x] 8.1 Backend: single upload (≤ 10 МБ, `multipart/form-data`) и chunked upload (> 10 МБ: init/part/complete/abort) в MinIO; порог `FILE_SINGLE_UPLOAD_MAX_MB` (env, по умолчанию 10); состояние частей в Mongo; валидация формата и лимита из страницы шага
- [x] 8.2 Frontend: дропзона — автоопределение режима по размеру; для chunked — прогресс (проценты/байты), пауза/продолжение, отмена
- [x] 8.3 Frontend/Backend: восстановление после обрыва — сохранённые чанки, «Возобновить загрузку» с места обрыва
- [x] 8.4 Backend: передача файла в endpoint провайдера (multipart целиком / чанки octet-stream), стадия обработки через поллинг статуса, результат (поля/текст)
- [x] 8.5 Frontend: экран результата файлового шага (извлечённые поля, «Загрузить другой файл»)
- [x] 8.6 Тесты: unit (выбор режима по размеру, валидация лимита), integration (single upload, chunked init/part/complete, resume после обрыва), e2e (загрузка файла ≤ 10 МБ → результат; загрузка > 10 МБ с паузой → возобновление → результат)

## 9. Milestone 8 — Observability, стабилизация и запуск

- [x] 9.1 Yandex Metrica (опционально): интеграция счётчика на frontend, активация по env `YANDEX_METRIKA_ID`; при отсутствии — скрипт не загружается
- [x] 9.2 Сбор логов / Monium (опционально): structured logging в backend (JSON), интеграция с Monium по env `LOG_COLLECTOR_URL` / `MONIUM_ENABLED`; при отсутствии — stdout/stderr
- [x] 9.3 Сквозной E2E-сценарий: импорт API → сборка мультисервисного сценария со страницами → публикация → запуск из маркетплейса (Playwright); проверка очереди, WebSocket-прогресса, статусов Run
- [x] 9.4 Демо-данные (seed): 3-4 приложения и 6+ карточек по мотивам прототипа
- [x] 9.5 Аудит безопасности: SSRF, OAuth-flow, лимиты запусков, rate limiting, шифрование констант-секретов at rest
- [x] 9.6 UX-полировка: тосты, пустые состояния, скелетоны, адаптив основных экранов
- [x] 9.7 Документация: README (запуск main+worker, архитектура очередей, WebSocket), обновление openspec/config.yaml (context проекта)
