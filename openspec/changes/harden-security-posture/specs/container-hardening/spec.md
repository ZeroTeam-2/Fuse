## ADDED Requirements

### Requirement: Non-root runtime в Docker
Все три Dockerfile (`apps/backend`, `apps/frontend`, `apps/proxy`) SHALL запускать процесс от имени non-root пользователя. Dockerfile MUST содержать `RUN addgroup -S app && adduser -S app -G app` и `USER app` перед `ENTRYPOINT`/`CMD`. Все `COPY` инструкции MUST использовать `--chown=app:app`.

#### Scenario: Backend container non-root
- **WHEN** backend-контейнер запущен
- **THEN** процесс `node` выполняется с UID пользователя `app`, а не `root`

#### Scenario: Файлы приложения принадлежат app
- **WHEN** выполняется `ls -la /app` внутри backend-контейнера
- **THEN** все файлы и директории принадлежат пользователю `app` и группе `app`

### Requirement: tini как PID 1
Все Dockerfile SHALL использовать `tini` (или эквивалент) как PID 1 через `ENTRYPOINT ["/sbin/tini","--"]` для корректного signal-handling и zombie-reaping.

#### Scenario: Корректная остановка по SIGTERM
- **WHEN** контейнеру отправляется `SIGTERM` (например, `docker stop`)
- **THEN** Node-процесс корректно завершается в течение 10 секунд без `SIGKILL`

### Requirement: Least-privilege capabilities в compose
`docker-compose.yml` SHALL для каждого сервиса определять `cap_drop: [ALL]` и `security_opt: ["no-new-privileges:true"]`. Дополнительные capabilities MUST быть явно перечислены через `cap_add` только при необходимости (например, `NET_BIND_SERVICE` для bind на порт < 1024).

#### Scenario: Drop всех capabilities
- **WHEN** выполняется `docker inspect <container>` на любом сервисе
- **THEN** `EffectiveCaps` содержит минимум capabilities (только явно добавленные через `cap_add`)

### Requirement: Read-only filesystem где возможно
Compose-сервисы SHALL использовать `read_only: true` для файловой системы контейнера, с явным `tmpfs`-маунтом для директорий, куда приложение пишет (`/tmp`, `/app/.cache`).

#### Scenario: Попытка записи в корень FS
- **WHEN** злоумышленник через RCE пытается создать файл в `/etc/` внутри контейнера
- **THEN** операция завершается с `EROFS` (read-only file system)

### Requirement: Resource limits в compose
`docker-compose.yml` SHALL для каждого сервиса задавать `mem_limit`, `cpus`, `pids_limit`. Минимальные значения: `mem_limit: 512m`, `cpus: "0.5"`, `pids_limit: 100` (настройки по сервису могут быть больше).

#### Scenario: Memory bomb контейнера
- **WHEN** процесс в контейнере пытается занять больше памяти, чем `mem_limit`
- **THEN** OOM-killer убивает процесс, а не роняет host

### Requirement: Bind dev-инфраструктуры на 127.0.0.1
`docker-compose.dev.yml` SHALL биндить все порты dev-инфраструктуры (mongo, minio, localstack, mock-api) на `127.0.0.1` (формат `127.0.0.1:HOST_PORT:CONTAINER_PORT`). Биндинг на `0.0.0.0` для dev-сервисов MUST быть запрещён.

#### Scenario: Mongo доступна только с localhost
- **WHEN** злоумышленник с соседней машины в Wi-Fi сети пытается подключиться к `dev-host:27018`
- **THEN** подключение отклоняется (порт слушает только 127.0.0.1)

### Requirement: Pin image digest для production-образов
Все `image:` директивы в compose (для образов, не собираемых локально) SHOULD пиниться по digest (`@sha256:...`). Использование `:latest` MUST быть запрещено.

#### Scenario: Воспроизводимый pull
- **WHEN** разработчик делает `docker compose pull` на двух разных машинах
- **THEN** оба получают идентичные образы по digest

### Requirement: Расширенный .dockerignore
`.dockerignore` SHALL исключать из build context: `.env*` (кроме `.env.example`), `.claude/`, `.cursor/`, `.opencode/`, `.turbo/`, `**/node_modules`, `**/dist`, `**/.nuxt`, `**/.output`, `**/test`, `**/e2e`, `docs/`, `openspec/`, `scripts/`, `*.md`, `LICENSE`.

#### Scenario: Build context без секретов
- **WHEN** выполняется `docker build` с актуальным `.dockerignore`
- **THEN` build context не содержит `.env` файлов или директорий с агентскими транскриптами
