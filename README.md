# Fuse

Платформа для создания и запуска сценариев автоматизации через API — маркетплейс интеграций, визуальный конструктор цепочек шагов и исполняющий движок.

## Архитектура

```
┌──────────────┐     ┌────────────────────────┐     ┌──────────────┐
│   Frontend   │────▶│        Backend         │────▶│   MongoDB    │
│  (Nuxt 3)    │     │  (NestJS: API + WS +   │     │              │
│              │◀───▶│   SQS-worker в одном   │     └──────────────┘
└──────────────┘  WS │      процессе)         │────▶┌──────────────┐
                     └───────────┬────────────┘     │    Garage    │
                                 │                   │  (S3 storage) │
                           ┌──────┴───────┐          └──────────────┘
                           │   AWS SQS    │
                           │  (очередь    │
                           │  исполнения) │
                           └──────────────┘
```

### Компоненты

- **Frontend** (`apps/frontend`) — Nuxt 3 SSR, Pinia, Tailwind-free scoped CSS. Страницы маркетплейса, конструктор сценариев, личный кабинет.
- **Backend** (`apps/backend`) — NestJS REST API. Модули: auth (Yandex OAuth + JWT), users, apps (импорт OpenAPI-спеков), scenarios (CRUD + валидация), marketplace (каталог карточек), execution (запуск сценариев), uploads (single + chunked), websocket (real-time события). SQS-consumer (`WorkerService`) исполняется в том же процессе и эмитит WebSocket-события напрямую через `RunGateway` (без внешнего брокера). Поддерживает шаги: api, delay, periodic (polling), scenario (вложенные), file.
- **AWS SQS** — очередь исполнения сценариев (enqueue при `POST /api/runs` → consumer в том же backend-процессе).
- **LocalStack** — локальная эмуляция AWS SQS для разработки.
- **MongoDB** — основное хранилище данных.
- **Garage** — S3-совместимое файловое хранилище локальной разработки (аватары, загруженные файлы). В бою вместо него внешний S3, адрес задаётся через `S3_URL`.
- **Caddy** — reverse proxy в docker-compose (роутит `/api/*` в backend, остальное во frontend).
- **Shared** (`packages/shared`) — общие TypeScript типы, enum'ы, категории, WebSocket события.

### Поток выполнения сценария

1. Пользователь запускает сценарий → `POST /api/runs`
2. Backend создаёт Run в MongoDB и отправляет задачу в SQS-очередь
3. SQS-consumer (в том же backend-процессе) подхватывает сообщение, выполняет шаги последовательно
4. WebSocket события (step:start, step:done, progress, page:required) эмитятся напрямую через `RunGateway` (Socket.IO) — worker и gateway в одном процессе
5. Frontend получает события через Socket.IO и обновляет UI в реальном времени
6. Для шагов типа `page` — исполнение переходит в режим ожидания ввода (WAITING_INPUT)

### Загрузка файлов

- **Single upload** (≤ 10 MB) — `POST /api/uploads/single` (multipart/form-data)
- **Chunked upload** (> 10 MB) — init → части → complete, с поддержкой паузы/возобновления
- Порог задаётся через `FILE_SINGLE_UPLOAD_MAX_MB`

## Установка

### Требования

- Node.js >= 20
- pnpm >= 9
- Docker и Docker Compose (для инфраструктуры)

## Локальный запуск

Фронтенд и бэкенд работают **на хосте** (hot-reload), а MongoDB, SQS и S3 —
**в контейнерах** (`docker-compose.dev.yml`). Очередь `scenario-execution` с DLQ
и бакет создаются автоматически.

```bash
# 1. Зависимости
pnpm install

# 2. Базовый .env (JWT_SECRET, OAuth-креды и т.п.)
cp .env.example .env

# 3. Инфраструктура в докере: MongoDB + LocalStack (SQS) + Garage (S3)
pnpm infra

# 4. Локальный профиль: приложение пойдёт в контейнеры, а не в удалённые сервисы
cp .env.local.example .env.local

# 5. Фронт и бэк на хосте
pnpm dev

# Или по отдельности:
pnpm dev:main      # backend API (+ SQS-worker в том же процессе)
pnpm dev:frontend  # frontend
```

Фронтенд — http://localhost:5173, бэкенд — http://localhost:3001.

### Порты инфраструктуры

| Сервис | Порт на хосте | Примечание |
|---|---|---|
| MongoDB | `27018` | не 27017 — чтобы не конфликтовать с системным `mongod` |
| SQS (LocalStack) | `4566` | очередь + DLQ создаются на старте |
| S3 (Garage) | `9000` | бакет `fuse` создаётся на старте; внутри контейнера порт 3900 |
| Мок-API | `8085` | go-httpbin; на него смотрит сид-приложение |

### Сид локальной БД

После `pnpm infra:reset` база пустая — в UI нечего открыть. `pnpm seed` заводит
пользователя, демо-приложение на мок-API и два сценария: «Демо: задержка»
(без внешних вызовов) и «Демо: запрос к API».

```bash
pnpm seed   # идемпотентен: повторный запуск не плодит дубликаты
```

Сид отказывается работать, если `MONGODB_URL` указывает не на локальную БД —
случайно засеять прод не получится. Id созданных сущностей пишутся в `.seed.json`
(в `.gitignore`) — оттуда их берут e2e-тесты.

### Переключение профилей окружения

Бэкенд читает `.env.local` **перед** `.env`, и при совпадении ключей побеждает
`.env.local`. Переменные, которых в нём нет (`JWT_SECRET`, OAuth-креды),
продолжают браться из `.env`.

```bash
cp .env.local.example .env.local   # → локальная инфраструктура в докере
rm .env.local                      # → удалённые сервисы из .env
```

`.env` при этом не редактируется. `.env.local` — в `.gitignore`.

Понять, к чему подключён бэкенд, можно по наличию `.env.local`; наверняка — по
соединениям процесса: `netstat -ano | grep <pid>` покажет `27018` и `4566` для
локального профиля.

> Это важно не только для удобства: удалённая очередь SQS общая с задеплоенным
> бэкендом. Без локального профиля он перехватывает запуски, отправленные с
> вашей машины, и запуск навсегда зависает в статусе «Выполняем сценарий…».

Свежая локальная БД пустая — приложений и сценариев в ней нет. Сид данных пока
не автоматизирован.

### Управление инфраструктурой

```bash
pnpm infra        # поднять (ждёт готовности очереди и бакета)
pnpm infra:logs   # логи
pnpm infra:down   # остановить; данные в томах сохраняются
pnpm infra:reset  # снести вместе с томами и поднять заново: чистая БД и бакет
```

После `pnpm infra:down` инфраструктура остаётся выключенной — перед `pnpm dev`
её нужно поднять обратно через `pnpm infra`, иначе бэкенд не достучится до
MongoDB (`ECONNREFUSED ... :27018`).

#### Переход с MinIO на Garage (разовый шаг)

Локальное S3-хранилище переехало с MinIO на Garage: образы `minio/minio` и
`minio/mc` удалены из Docker Hub, апстрим архивирован, и `pnpm infra` на чистой
машине перестал подниматься. Что нужно сделать каждому один раз:

```bash
# 1. Снять старый контейнер: compose про него больше не знает, он остаётся
#    осиротевшим и держит порт 9000 и свой том.
docker compose -f docker-compose.dev.yml down --remove-orphans

# 2. Удалить том MinIO (данные в нём не переносятся — это локальные файлы).
docker volume rm fuse_fuse-minio-data

# 3. Поправить S3_SECRET_KEY в своём .env.local — файл в .gitignore и сам
#    не обновится. Новое значение см. в .env.local.example: Garage не стартует
#    с секретом короче 16 символов, а прежний `minioadmin` — 10.

# 4. Поднять заново.
pnpm infra
```

Если пропустить шаг 3, бэкенд поднимется, но все обращения к S3 будут падать на
проверке подписи.

#### Как посмотреть содержимое бакета

Веб-консоли у Garage нет (это была консоль MinIO на `9001`). Вместо неё:

```bash
pnpm test:infra                                  # бакет существует + round-trip объекта
docker exec fuse-garage /garage bucket info fuse # размер, число объектов, права ключа
docker exec fuse-garage /garage status           # состояние ноды
```

Для полноценного просмотра файлов подойдёт любой S3-клиент (`aws-cli`, `rclone`)
на эндпоинт `http://localhost:9000`, регион `us-east-1`, с кредами из `.env.local`.

## Запуск через Docker Compose (полный стек)

Полный стек в докере (backend + frontend + caddy) — это `docker-compose.yml`.
`docker-compose.dev.yml` приложение **не** поднимает: там только инфраструктура.

```bash
cp .env.example .env
# Заполнить MONGODB_URL, JWT_SECRET, NUXT_SESSION_SECRET, Yandex OAuth credentials

docker compose up -d --build
# Доступно на http://localhost:${HTTP_PORT:-8081}
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `NODE_ENV` | `development` | Режим работы |
| `PORT` | `3001` | Порт backend API |
| `MONGODB_URL` | — | URL подключения к MongoDB |
| `AWS_REGION` | `us-east-1` | AWS регион для SQS |
| `AWS_SQS_QUEUE_URL` | — | URL SQS-очереди исполнения сценариев |
| `AWS_ACCESS_KEY_ID` | `test` | AWS access key (LocalStack: `test`) |
| `AWS_SECRET_ACCESS_KEY` | `test` | AWS secret key (LocalStack: `test`) |
| `AWS_ENDPOINT_URL` | — | Endpoint для LocalStack (пусто = реальный AWS) |
| `S3_URL` | `localhost` | Хост S3 |
| `S3_PORT` | `9000` | Порт S3 |
| `S3_ACCESS_KEY` | `minioadmin` | Ключ доступа S3 |
| `S3_SECRET_KEY` | `fuse-local-dev-secret` | Секрет S3; локально не короче 16 символов (требование Garage) |
| `S3_BUCKET` | `fuse` | Bucket S3 |
| `JWT_SECRET` | — | Секрет для JWT (мин. 32 символа) |
| `JWT_ACCESS_EXPIRES` | `15m` | Время жизни access-токена |
| `JWT_REFRESH_EXPIRES` | `7d` | Время жизни refresh-токена |
| `YANDEX_CLIENT_ID` | — | Client ID Yandex OAuth |
| `YANDEX_CLIENT_SECRET` | — | Client Secret Yandex OAuth |
| `YANDEX_REDIRECT_URI` | — | URI редиректа OAuth |
| `FILE_SINGLE_UPLOAD_MAX_MB` | `10` | Порог single vs chunked upload (MB) |
| `LOG_COLLECTOR_URL` | — | URL внешнего лог-коллектора |
| `MONIUM_ENABLED` | — | Включить отправку логов (=`true`) |
| `NUXT_PUBLIC_API_BASE_URL` | — | Базовый URL API для фронтенда |
| `NUXT_PUBLIC_YANDEX_METRIKA_ID` | — | ID счётчика Yandex Metrica |
| `NUXT_SESSION_SECRET` | — | Секрет сессии Nuxt (мин. 32 символа) |

## Команды разработки

```bash
pnpm dev              # Запуск backend + frontend
pnpm dev:main         # Только backend API (+ SQS-worker)
pnpm dev:frontend     # Только frontend
pnpm build            # Сборка всех пакетов
pnpm typecheck        # TypeScript проверка всех пакетов
pnpm test             # Юнит-тесты (vitest)
pnpm test:infra       # Smoke-тест локальной инфраструктуры (нужен pnpm infra)
pnpm test:e2e         # E2E в браузере (нужны pnpm infra + pnpm seed + pnpm dev)
pnpm seed             # Наполнить локальную БД сид-данными
pnpm lint             # Линтинг (oxlint)
pnpm format           # Форматирование (oxfmt)
pnpm gen:types        # Генерация типов из OpenAPI-спеки backend'а
pnpm infra            # Поднять инфраструктуру: MongoDB + LocalStack (SQS) + Garage (S3)
pnpm infra:logs       # Логи инфраструктуры
pnpm infra:down       # Остановить инфраструктуру (данные сохраняются)
pnpm infra:reset      # Остановить и удалить тома (чистая БД и бакет)
```

## Граф кода (graphify MCP)

В репозитории настроен project-scoped MCP-сервер `graphify` (`.mcp.json`). Он даёт агенту
навигацию по графу кода: поиск по связям, соседей узла, ключевые абстракции (god nodes),
сообщества и кратчайшие пути между сущностями — вместо чтения файлов пачками.

Сам граф (`graphify-out/`) в историю не коммитится, он собирается локально. Порядок:

```bash
# 1. Один раз: поставить graphify, чтобы бинарь был в PATH
#    (команда graphify-mcp из .mcp.json берётся оттуда же)

# 2. Собрать граф — скилл /graphify в агенте (нужен LLM для разметки и кластеризации)
#    В Claude Code:  /graphify

# 3. Дальше инкрементально, уже без LLM:
graphify update .
```

Пока `graphify-out/graph.json` не собран, MCP-сервер не поднимется — это ожидаемо и на
сборку, тесты и запуск проекта никак не влияет. Инструмент `graph_stats` сообщает, на каком
коммите построен граф, и предупреждает, если он отстал от `HEAD`.

## Структура проекта

```
Fuse/
├── apps/
│   ├── backend/          # NestJS API + worker
│   │   ├── src/
│   │   │   ├── auth/     # Yandex OAuth, JWT
│   │   │   ├── users/    # Профили пользователей
│   │   │   ├── apps/     # Импорт OpenAPI, CRUD приложений
│   │   │   ├── scenarios/# Конструктор сценариев
│   │   │   ├── marketplace/ # Каталог карточек
│   │   │   ├── execution/# Запуск и выполнение сценариев
│   │   │   ├── uploads/  # Single + chunked загрузка файлов
│   │   │   ├── minio/    # S3-хранилище
│   │   │   ├── websocket/# Real-time события
│   │   │   ├── logging/  # Структурированное логирование
│   │   │   └── seed/     # Демонстрационные данные
│   │   └── test/         # E2E и unit тесты
│   └── frontend/         # Nuxt 3 SSR
│       ├── components/   # Vue компоненты
│       ├── pages/        # Страницы (маркетплейс, личный кабинет)
│       ├── stores/       # Pinia stores
│       ├── composables/  # Композабл-функции
│       ├── plugins/      # Nuxt плагины (API, auth, metrica)
│       └── e2e/          # Playwright тесты
├── packages/
│   └── shared/           # Общие типы, enum'ы, категории
├── docker-compose.yml     # Полный стек в докере (backend + frontend + caddy)
├── docker-compose.dev.yml # Только инфраструктура для разработки на хосте
└── Caddyfile              # Конфигурация reverse proxy
```

## Безопасность

- **SSRF-защита** — все внешние запросы валидируются через `SsrfGuard` (блокировка приватных IP, localhost, link-local)
- **JWT-аутентификация** — глобальный guard на всех endpoint'ах, кроме публичных
- **OAuth через Yandex** — авторизация через Yandex ID, без хранения паролей
- **Валидация входных данных** — `class-validator` + DTO на всех endpoint'ах
- **CORS** — в production запрещены кросс-доменные запросы

## Лицензия

MIT
