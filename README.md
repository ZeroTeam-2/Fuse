# Fuse

Платформа для создания и запуска сценариев автоматизации через API — маркетплейс интеграций, визуальный конструктор цепочек шагов и исполняющий движок.

## Архитектура

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   MongoDB    │
│  (Nuxt 3)    │     │  (NestJS)    │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                      ┌──────┴───────┐     ┌──────────────┐
                      │    Redis     │────▶│   MinIO      │
                      │  (pub/sub    │     │  (S3 storage) │
                      │   WS events) │     └──────────────┘
                      └──────┬───────┘
                             │
                      ┌──────┴───────┐
                      │   Worker     │
                      │ (NestJS +    │
                      │   SQS)       │
                      └──────────────┘
```

### Компоненты

- **Frontend** (`apps/frontend`) — Nuxt 3 SSR, Pinia, Tailwind-free scoped CSS. Страницы маркетплейса, конструктор сценариев, личный кабинет.
- **Backend** (`apps/backend`) — NestJS REST API. Модули: auth (Yandex OAuth + JWT), users, apps (импорт OpenAPI-спеков), scenarios (CRUD + валидация), marketplace (каталог карточек), execution (запуск сценариев), uploads (single + chunked), websocket (real-time события).
- **Worker** (`apps/backend` — `worker.ts`) — отдельный процесс, обрабатывающий SQS-задачи выполнения сценариев. Поддерживает шаги: api, delay, periodic (polling), scenario (вложенные), file.
- **Redis** — pub/sub для WebSocket событий.
- **AWS SQS** — очередь исполнения сценариев (main → worker).
- **LocalStack** — локальная эмуляция AWS SQS для разработки.
- **MongoDB** — основное хранилище данных.
- **MinIO** — S3-совместимое файловое хранилище (аватары, загруженные файлы).
- **Caddy** — reverse proxy в docker-compose (роутит `/api/*` в backend, остальное во frontend).
- **Shared** (`packages/shared`) — общие TypeScript типы, enum'ы, категории, WebSocket события.

### Поток выполнения сценария

1. Пользователь запускает сценарий → `POST /api/runs`
2. Backend создаёт Run в MongoDB и отправляет задачу в SQS-очередь
3. Worker подхватывает сообщение из SQS, выполняет шаги последовательно
4. WebSocket события (step:start, step:done, progress, page:required) публикуются через Redis pub/sub
5. Frontend получает события через Socket.IO и обновляет UI в реальном времени
6. Для шагов типа `page` — worker переходит в режим ожидания ввода (WAITING_INPUT)

### Загрузка файлов

- **Single upload** (≤ 10 MB) — `POST /api/uploads/single` (multipart/form-data)
- **Chunked upload** (> 10 MB) — init → части → complete, с поддержкой паузы/возобновления
- Порог задаётся через `FILE_SINGLE_UPLOAD_MAX_MB`

## Установка

### Требования

- Node.js >= 20
- pnpm >= 9
- Docker и Docker Compose (для инфраструктуры)

### Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone <repo-url> && cd Fuse

# 2. Установить зависимости
pnpm install

# 3. Скопировать и заполнить .env
cp .env.example .env

# 4. Поднять инфраструктуру (MongoDB, Redis, MinIO)
pnpm infra

# 5. Запустить разработку (backend + frontend параллельно)
pnpm dev

# Или запустить по отдельности:
pnpm dev:main      # backend API
pnpm dev:worker    # worker
pnpm dev:frontend  # frontend
```

### Запуск через Docker Compose (полный стек)

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
| `REDIS_URL` | `redis://localhost:6379` | URL Redis (pub/sub WebSocket) |
| `AWS_REGION` | `us-east-1` | AWS регион для SQS |
| `AWS_SQS_QUEUE_URL` | — | URL SQS-очереди исполнения сценариев |
| `AWS_ACCESS_KEY_ID` | `test` | AWS access key (LocalStack: `test`) |
| `AWS_SECRET_ACCESS_KEY` | `test` | AWS secret key (LocalStack: `test`) |
| `AWS_ENDPOINT_URL` | — | Endpoint для LocalStack (пусто = реальный AWS) |
| `MINIO_ENDPOINT` | `localhost` | Хост MinIO |
| `MINIO_PORT` | `9000` | Порт MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Ключ доступа MinIO |
| `MINIO_SECRET_KEY` | `minioadmin` | Секрет MinIO |
| `MINIO_BUCKET` | `fuse` | Bucket MinIO |
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
pnpm dev:main         # Только backend API
pnpm dev:worker       # Только worker
pnpm dev:frontend     # Только frontend
pnpm build            # Сборка всех пакетов
pnpm typecheck        # TypeScript проверка всех пакетов
pnpm test             # Запуск тестов (vitest)
pnpm lint             # Линтинг (oxlint)
pnpm format           # Форматирование (oxfmt)
pnpm gen:types        # Генерация типов из OpenAPI-спеки backend'а
pnpm infra            # Поднять MongoDB + Redis + MinIO + LocalStack
pnpm infra:down       # Остановить инфраструктуру
```

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
├── docker-compose.yml    # Инфраструктура + продакшен-стек
└── Caddyfile             # Конфигурация reverse proxy
```

## Безопасность

- **SSRF-защита** — все внешние запросы валидируются через `SsrfGuard` (блокировка приватных IP, localhost, link-local)
- **JWT-аутентификация** — глобальный guard на всех endpoint'ах, кроме публичных
- **OAuth через Yandex** — авторизация через Yandex ID, без хранения паролей
- **Валидация входных данных** — `class-validator` + DTO на всех endpoint'ах
- **CORS** — в production запрещены кросс-доменные запросы

## Лицензия

MIT
