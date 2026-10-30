## Why

Репозитории `minio/minio` и `minio/mc` удалены с Docker Hub (примерно сентябрь 2026), зеркало `quay.io/minio/*` закрыто для анонимных пуллов, апстрим MinIO архивирован и переведён в read-only. `pnpm infra` больше не поднимается с нуля ни у одного разработчика: Docker отвечает `pull access denied for minio/minio, repository does not exist or may require 'docker login'` — это не проблема сети или авторизации, а отсутствие репозитория, и откатом на пин конкретного релиза не лечится (все теги отдают 401). Локальная разработка заблокирована для любого, у кого образ не осел в кэше раньше.

## What Changes

- Заменить сервис `minio` в `docker-compose.dev.yml` на `dxflrs/garage:v2.5.0` — S3-совместимое хранилище с живым публичным образом.
- Запускать Garage в режиме `garage server --single-node --default-bucket`: он сам инициализирует однонодовый кластер (без `layout assign`/`layout apply`), заводит ключ и бакет из `GARAGE_DEFAULT_ACCESS_KEY` / `GARAGE_DEFAULT_SECRET_KEY` / `GARAGE_DEFAULT_BUCKET`.
- Удалить сервис `minio-init` и скрипт `docker/minio/init-bucket.sh` — бутстрап бакета больше не нужен, вместе с ним уходит `depends_on: service_healthy` и второй шаг в `pnpm infra`.
- Добавить `docker/garage/garage.toml` (`replication_factor = 1`, `db_engine = "sqlite"`, `rpc_secret`, `s3_region = "us-east-1"`), монтируемый в контейнер по аналогии с `docker/localstack/init-sqs.sh`.
- Опубликовать S3-порт как `9000:3900` (у Garage S3 API слушает 3900), чтобы `.env.local.example` и `S3_URL`/`S3_PORT` остались нетронутыми.
- Заменить healthcheck `mc ready local` на проверку средствами Garage — критично, потому что `pnpm infra` идёт с `--wait`.
- Заменить том `fuse-minio-data` на тома метаданных и данных Garage; обновить `pnpm infra:reset`, чтобы сброс сносил именно их.
- **BREAKING (для локальной разработки)**: админ-консоль на `http://localhost:9001` исчезает — у Garage нет собственного веб-UI. Инспекция бакета — через `aws-cli`/`rclone` или сторонний garage-webui.
- Обновить таблицу портов и раздел про инфраструктуру в `README.md`.

## Capabilities

### New Capabilities

(нет новых capabilities — замена инфраструктурной зависимости в рамках существующей)

### Modified Capabilities

- `local-dev-environment`: требование «Контейнеризованная локальная инфраструктура» перестаёт называть MinIO конкретным поставщиком S3 и больше не обещает админ-консоль на `localhost:9001`; требование «Готовность очереди и бакета при старте» переносит создание бакета с отдельного бутстрап-контейнера на штатный режим самого хранилища; требование «Управление жизненным циклом инфраструктуры» описывает удаление томов Garage вместо тома MinIO.

## Impact

- **Инфраструктура**: `docker-compose.dev.yml` (сервисы `minio`, `minio-init`, секция `volumes`), новый `docker/garage/garage.toml`, удаление `docker/minio/init-bucket.sh`.
- **Код бэкенда**: не меняется. `apps/backend/src/minio/minio.service.ts` использует только presigned GET, multipart (`initiateNewMultipartUpload`/`uploadPart`/`completeMultipartUpload`/`abortMultipartUpload`), `putObject`/`getObject`/`removeObject` и `bucketExists`/`makeBucket` — всё это у Garage реализовано. Имена `MinioService`/`MinioModule` остаются как есть: переименование вынесено за рамки этого изменения.
- **Зависимости**: npm-пакет `minio` (клиент) остаётся — он работает с любым S3-совместимым эндпоинтом. Уходит только образ сервера.
- **Риск совместимости**: Garage отклоняет запросы к чужому региону с `AuthorizationHeaderMalformed`, а клиент в `minio.service.ts` регион не передаёт и полагается на автодискавери. Снимается явным `s3_region = "us-east-1"` в конфиге; проверяется запуском, а не доверием к докам.
- **Тесты**: `apps/backend/test/infra-smoke.infra-spec.ts` правок не требует (ходит через тот же клиент по `S3_URL`/`S3_PORT`), но служит приёмочным гейтом.
- **Документация**: `README.md` — таблица портов (строка про консоль MinIO) и раздел «Управление инфраструктурой».
- **Не затрагивается**: прод и `docker-compose.yml` — там внешний S3 (Timeweb), MinIO был исключительно локальной заглушкой; MongoDB, LocalStack (SQS), mock-api; UI и движок исполнения.
